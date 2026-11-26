FROM docker.io/library/debian:trixie-slim@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a

LABEL org.opencontainers.image.title="MarketWeft Research Service" \
      org.opencontainers.image.source="https://github.com/Yunushan/marketweft" \
      org.opencontainers.image.base.name="docker.io/library/debian:trixie-slim" \
      org.opencontainers.image.base.digest="sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a"

COPY --chmod=0555 marketweft-research-service /usr/local/bin/marketweft-research-service
COPY LICENSE README.md /usr/share/doc/marketweft-research/
COPY notices/ /usr/share/doc/marketweft-research/notices/
COPY proto/ /usr/share/marketweft/proto/

RUN install -d -m 0700 -o 65532 -g 65532 /var/lib/marketweft/credentials /var/lib/marketweft/audit

USER 65532:65532
EXPOSE 4174/tcp
ENTRYPOINT ["/usr/local/bin/marketweft-research-service"]
