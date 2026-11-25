"""Loopback-only fixture for the opt-in upstream integration test."""
from pathlib import Path
import os
import socket
import sys

sys.path.insert(0, str(Path(sys.argv[1]) / "Languages" / "Python"))
import uvicorn
from app.service.api.app import create_service_api_app
from app.service.runtime import TradingBotService

if os.environ.get("BOT_SERVICE_API_READ_ONLY") != "1":
    raise SystemExit("Read-only service mode is required")

if sys.argv[2] == "empty":
    app = create_service_api_app()
elif sys.argv[2] == "observed":
    fixture = TradingBotService()
    # Check the actual upstream descriptor when the local adapter is attached.
    # Attaching it exposes its capabilities without starting a session.
    probe = TradingBotService()
    probe.enable_local_executor()
    plane = probe.describe_runtime().control_plane
    assert plane.execution_scope == "service-lifecycle-heartbeat"
    assert plane.start_supported and not plane.trading_execution_supported

    stamp = "2025-02-03T12:30:00+00:00"
    fixture.set_account_snapshot(total_balance=123.5, available_balance=80, observed_at=stamp, source="synthetic-fixture")
    fixture.set_portfolio_snapshot(
        open_position_records={
            "example": {
                "symbol": "SYNTH", "side_key": "SPOT",
                "data": {"qty": 2.5, "mark": 10, "pnl_value": 1.25},
            },
        },
        observed_at=stamp,
        source="synthetic-fixture",
    )
    app = create_service_api_app(service=fixture, observation_provider="test-fixture")
else:
    raise SystemExit("Unknown fixture mode")

with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    print(listener.getsockname()[1], flush=True)
    uvicorn.Server(uvicorn.Config(app, log_level="warning", access_log=False)).run(sockets=[listener])
