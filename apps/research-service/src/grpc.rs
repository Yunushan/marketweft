use crate::{
    analytics,
    audit::{Outcome, Transport},
    proto::{
        research_server::{Research, ResearchServer},
        AmericanOptionQuery, AmericanOptionResponse, FormulaPage, FormulaQuery, MacroCalendarPage,
        MacroCalendarQuery, MonthlyReturnsPage, MonthlyReturnsQuery, OptionPage, OptionQuery,
        RankComparisonPage, RankComparisonQuery, ScreenPage, ScreenQuery,
    },
    shutdown::ResearchPermit,
    ApiError, Scope, Server, BODY_LIMIT,
};
use axum::{
    body::Body,
    extract::{Request, State},
    http::{Method, StatusCode, Version},
    middleware::{from_fn_with_state, Next},
    response::Response,
    Router,
};
use std::{sync::Arc, time::Duration};
use tokio::time::timeout;
use tonic::{Code, Request as GrpcRequest, Response as GrpcResponse, Status};

const CALL_TIMEOUT: Duration = Duration::from_secs(15);

pub(crate) fn routes(state: Arc<Server>) -> Router {
    let service = ResearchServer::new(LocalResearch)
        .max_decoding_message_size(BODY_LIMIT)
        .max_encoding_message_size(BODY_LIMIT);
    Router::new()
        .route_service(
            "/marketweft.research.v1.Research/EvaluateFormula",
            service.clone(),
        )
        .route_service(
            "/marketweft.research.v1.Research/GetMonthlyReturns",
            service.clone(),
        )
        .route_service(
            "/marketweft.research.v1.Research/GetMacroCalendar",
            service.clone(),
        )
        .route_layer(from_fn_with_state(
            (Arc::clone(&state), Scope::Formula),
            guard,
        ))
        .merge(
            Router::new()
                .route_service(
                    "/marketweft.research.v1.Research/ScreenUniverse",
                    service.clone(),
                )
                .route_service(
                    "/marketweft.research.v1.Research/CompareUniverseRanks",
                    service.clone(),
                )
                .route_layer(from_fn_with_state(
                    (Arc::clone(&state), Scope::Screen),
                    guard,
                )),
        )
        .merge(
            Router::new()
                .route_service(
                    "/marketweft.research.v1.Research/SnapshotOptions",
                    service.clone(),
                )
                .route_service(
                    "/marketweft.research.v1.Research/ValueAmericanOption",
                    service,
                )
                .route_layer(from_fn_with_state((state, Scope::Options), guard)),
        )
}

async fn guard(
    State((state, scope)): State<(Arc<Server>, Scope)>,
    mut request: Request,
    next: Next,
) -> Response {
    if request.version() != Version::HTTP_2 {
        return grpc_error(Status::unimplemented("Use HTTP/2 for gRPC research."));
    }
    if request.method() != Method::POST {
        return grpc_error(Status::unimplemented("Use POST for gRPC research."));
    }
    let authority = request
        .uri()
        .authority()
        .map(|authority| authority.as_str());
    let credential = match state.authorize(request.headers(), authority, scope).await {
        Ok(credential) => credential,
        Err(error) => return grpc_error(status(error)),
    };
    let admission = match state.admit(scope, Transport::Grpc, credential).await {
        Ok(admission) => admission,
        Err(error) => return grpc_error(status(error)),
    };
    request
        .extensions_mut()
        .insert(Arc::clone(&admission.permit));
    let response = timeout(CALL_TIMEOUT, next.run(request))
        .await
        .unwrap_or_else(|_| {
            grpc_error(Status::deadline_exceeded(
                "Research call exceeded its deadline.",
            ))
        });
    let outcome = match response
        .headers()
        .get("grpc-status")
        .map(|code| code.as_bytes())
    {
        None => Outcome::from_http(response.status()),
        Some(b"0") => Outcome::Completed,
        Some(b"1") => Outcome::Interrupted,
        Some(b"4") => Outcome::TimedOut,
        Some(b"3" | b"7" | b"8" | b"9" | b"11" | b"12" | b"16") => Outcome::Rejected,
        Some(_) => Outcome::Failed,
    };
    match admission.finish(outcome).await {
        Ok(()) => response,
        Err(error) => grpc_error(status(error)),
    }
}

fn grpc_error(status: Status) -> Response {
    status.into_http::<tonic::body::Body>().map(Body::new)
}

fn status(error: ApiError) -> Status {
    let code = match error.status {
        StatusCode::UNAUTHORIZED => Code::Unauthenticated,
        StatusCode::FORBIDDEN => Code::PermissionDenied,
        StatusCode::TOO_MANY_REQUESTS | StatusCode::PAYLOAD_TOO_LARGE => Code::ResourceExhausted,
        StatusCode::SERVICE_UNAVAILABLE => Code::Unavailable,
        StatusCode::BAD_REQUEST | StatusCode::UNPROCESSABLE_ENTITY => Code::InvalidArgument,
        _ => Code::Internal,
    };
    let mut status = Status::new(code, error.message);
    if let Some(retry) = error.retry_after {
        status.metadata_mut().insert(
            "retry-after",
            retry
                .to_string()
                .parse()
                .expect("integer retry delay is valid metadata"),
        );
    }
    status
}

#[derive(Clone)]
struct LocalResearch;

#[tonic::async_trait]
impl Research for LocalResearch {
    async fn evaluate_formula(
        &self,
        request: GrpcRequest<FormulaQuery>,
    ) -> Result<GrpcResponse<FormulaPage>, Status> {
        unary(request, analytics::evaluate_formula).await
    }

    async fn get_monthly_returns(
        &self,
        request: GrpcRequest<MonthlyReturnsQuery>,
    ) -> Result<GrpcResponse<MonthlyReturnsPage>, Status> {
        unary(request, analytics::evaluate_monthly_returns).await
    }

    async fn get_macro_calendar(
        &self,
        request: GrpcRequest<MacroCalendarQuery>,
    ) -> Result<GrpcResponse<MacroCalendarPage>, Status> {
        unary(request, analytics::evaluate_macro_calendar).await
    }

    async fn screen_universe(
        &self,
        request: GrpcRequest<ScreenQuery>,
    ) -> Result<GrpcResponse<ScreenPage>, Status> {
        unary(request, analytics::evaluate_screen).await
    }

    async fn compare_universe_ranks(
        &self,
        request: GrpcRequest<RankComparisonQuery>,
    ) -> Result<GrpcResponse<RankComparisonPage>, Status> {
        unary(request, analytics::evaluate_rank_comparison).await
    }

    async fn snapshot_options(
        &self,
        request: GrpcRequest<OptionQuery>,
    ) -> Result<GrpcResponse<OptionPage>, Status> {
        unary(request, analytics::evaluate_options).await
    }

    async fn value_american_option(
        &self,
        request: GrpcRequest<AmericanOptionQuery>,
    ) -> Result<GrpcResponse<AmericanOptionResponse>, Status> {
        unary(request, analytics::evaluate_american).await
    }
}

type PageOperation<Query, Page> = fn(Query, &mut dyn FnMut(Page) -> bool) -> Result<(), ApiError>;

async fn unary<Query: Send + 'static, Page: Send + 'static>(
    request: GrpcRequest<Query>,
    run: PageOperation<Query, Page>,
) -> Result<GrpcResponse<Page>, Status> {
    let (_, mut extensions, query) = request.into_parts();
    let permit = extensions
        .remove::<Arc<ResearchPermit>>()
        .ok_or_else(|| Status::internal("Research authorization is missing."))?;
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        analytics::first_page(|emit| run(query, emit))
    })
    .await
    .map_err(|_| Status::internal("Research worker failed."))?
    .map(GrpcResponse::new)
    .map_err(status)
}
