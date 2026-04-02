"""
OpenTelemetry setup for the ML service.

Console exporter by default. Set OTEL_EXPORTER_OTLP_ENDPOINT env var
to switch to OTLP (e.g. http://otel-collector:4317).
"""

from __future__ import annotations

import os

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    ConsoleSpanExporter,
)
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.psycopg2 import Psycopg2Instrumentor


def setup_telemetry(app: object) -> None:
    """Initialize OTel tracing and instrument FastAPI + psycopg2."""
    resource = Resource.create(
        {
            "service.name": os.environ.get("OTEL_SERVICE_NAME", "cycling-ml"),
            "service.version": "0.0.0",
        }
    )

    provider = TracerProvider(resource=resource)

    otlp_endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if otlp_endpoint:
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter,
        )

        exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
    else:
        exporter = ConsoleSpanExporter()

    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
    Psycopg2Instrumentor().instrument()
