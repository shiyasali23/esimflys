import logging
import uuid

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("apps")


class DomainError(APIException):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    error_code = "validation_error"
    default_message = "The request could not be completed."

    def __init__(self, message=None, fields=None, error_code=None, status_code=None):
        self.error_code = error_code or self.error_code
        self.message = message or self.default_message
        self.fields = fields or {}
        if status_code is not None:
            self.status_code = status_code
        super().__init__(detail=self.message, code=self.error_code)


class PlanUnavailable(DomainError):
    status_code = status.HTTP_409_CONFLICT
    error_code = "plan_unavailable"
    default_message = "This plan is currently unavailable."


class CartExpired(DomainError):
    status_code = status.HTTP_409_CONFLICT
    error_code = "cart_expired"
    default_message = "This cart has expired."


class PromoInvalid(DomainError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    error_code = "promo_invalid"
    default_message = "This promo code is not valid."


class PaymentMismatch(DomainError):
    status_code = status.HTTP_409_CONFLICT
    error_code = "payment_mismatch"
    default_message = "The payment could not be reconciled with the order."


class InvalidQuantity(DomainError):
    status_code = status.HTTP_400_BAD_REQUEST
    error_code = "invalid_quantity"
    default_message = "The requested quantity is invalid."


class PromoExpired(DomainError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    error_code = "promo_expired"
    default_message = "This promo code has expired."


class PromoUsageExceeded(DomainError):
    status_code = status.HTTP_409_CONFLICT
    error_code = "promo_usage_exceeded"
    default_message = "This promo code has reached its usage limit."


class Conflict(DomainError):
    status_code = status.HTTP_409_CONFLICT
    error_code = "conflict"
    default_message = "The request conflicts with the current state."


class RefundLimitExceeded(DomainError):
    status_code = status.HTTP_409_CONFLICT
    error_code = "refund_limit_exceeded"
    default_message = "This refund exceeds the refundable balance."


class InvalidCredentials(DomainError):
    status_code = status.HTTP_401_UNAUTHORIZED
    error_code = "invalid_credentials"
    default_message = "Invalid email or password."


class TopupNotSupported(DomainError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    error_code = "topup_not_supported"
    default_message = "This top-up is not available for this eSIM."


_STATUS_CODE_MAP = {
    status.HTTP_401_UNAUTHORIZED: "authentication_required",
    status.HTTP_403_FORBIDDEN: "permission_denied",
    status.HTTP_404_NOT_FOUND: "not_found",
    status.HTTP_405_METHOD_NOT_ALLOWED: "method_not_allowed",
    status.HTTP_406_NOT_ACCEPTABLE: "not_acceptable",
    status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: "unsupported_media_type",
    status.HTTP_429_TOO_MANY_REQUESTS: "rate_limited",
}


def _envelope(code, message, fields):
    return {"error": {"code": code, "message": message, "fields": fields}}


def api_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        correlation_id = uuid.uuid4().hex
        logger.exception("Unhandled API exception [correlation_id=%s]", correlation_id)
        if settings.DEBUG:
            return None
        return Response(
            {
                "error": {
                    "code": "internal_error",
                    "message": "An unexpected error occurred.",
                    "correlation_id": correlation_id,
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(exc, DomainError):
        response.data = _envelope(exc.error_code, exc.message, exc.fields)
        return response

    if isinstance(response.data, dict) and "detail" in response.data and len(response.data) == 1:
        detail = response.data["detail"]
        code = _STATUS_CODE_MAP.get(response.status_code, "error")
        response.data = _envelope(code, str(detail), {})
        return response

    code = "validation_error" if response.status_code == status.HTTP_400_BAD_REQUEST else _STATUS_CODE_MAP.get(
        response.status_code, "error"
    )
    response.data = _envelope(code, "The request could not be processed.", response.data)
    return response
