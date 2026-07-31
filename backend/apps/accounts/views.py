from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.administration.audit import record_audit
from apps.common.exceptions import InvalidCredentials

from .models import CommissionPayout, Organization, PartnerCommission
from .services import is_agency_account
from .serializers import (
    CommissionPayoutSerializer,
    LoginSerializer,
    OrganizationSerializer,
    PartnerCommissionSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetSerializer,
    RegisterSerializer,
    UserSerializer,
)

User = get_user_model()


class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        payload = RegisterSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        user = User.objects.create_user(
            email=payload.validated_data["email"],
            password=payload.validated_data["password"],
            first_name=payload.validated_data.get("first_name", ""),
            last_name=payload.validated_data.get("last_name", ""),
        )
        # Multiple auth backends are configured (Django + allauth), so login() cannot infer
        # which one authenticated a freshly-created user — name it explicitly.
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response(UserSerializer(user).data, status=201)


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        payload = LoginSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=payload.validated_data["email"],
            password=payload.validated_data["password"],
        )
        if user is None:
            raise InvalidCredentials()
        login(request, user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=204)


class PasswordResetView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        payload = PasswordResetSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        user = User.objects.filter(
            email=payload.validated_data["email"], is_active=True
        ).first()

        # Agency credentials are platform-issued and cannot be self-managed, so an agency
        # account cannot reset its own password — the platform does it via
        # /admin/organizations/{id}/members/{id}/set-password/. The response below is
        # identical either way, so this does not reveal whether the address exists.
        if user is not None and is_agency_account(user=user):
            record_audit(
                action="password_reset.blocked_agency_account",
                actor_type="system",
                context={"email": user.email},
                request=request,
            )
            user = None

        if user is not None:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            send_mail(
                "eSIMFlys — reset your password",
                f"Use these values to reset your password.\nuid: {uid}\ntoken: {token}",
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
                fail_silently=True,
            )
        return Response(
            {"detail": "If an account exists for that email, reset instructions have been sent."}
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        payload = PasswordResetConfirmSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            uid = force_str(urlsafe_base64_decode(payload.validated_data["uid"]))
            user = User.objects.get(pk=uid)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            user = None
        if user is None or not default_token_generator.check_token(
            user, payload.validated_data["token"]
        ):
            raise ValidationError({"token": ["Invalid or expired reset link."]})
        user.set_password(payload.validated_data["new_password"])
        user.save(update_fields=["password", "updated_at"])
        return Response({"detail": "Your password has been reset."})


class MeView(RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer
    http_method_names = ["get", "patch"]

    def get_object(self):
        return self.request.user


def _member_orgs(user):
    return Organization.objects.filter(
        members__user=user, members__status="active"
    ).distinct()


class OrganizationListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OrganizationSerializer

    def get_queryset(self):
        return _member_orgs(self.request.user).order_by("name")


class OrganizationDetailView(RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OrganizationSerializer
    lookup_field = "id"

    def get_queryset(self):
        return _member_orgs(self.request.user)


class OrganizationCommissionsView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = PartnerCommissionSerializer

    def get_queryset(self):
        org = get_object_or_404(_member_orgs(self.request.user), pk=self.kwargs["id"])
        return (
            PartnerCommission.objects.filter(organization=org)
            .select_related("order")
            .order_by("-created_at")
        )


class OrganizationPayoutsView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CommissionPayoutSerializer

    def get_queryset(self):
        org = get_object_or_404(_member_orgs(self.request.user), pk=self.kwargs["id"])
        return CommissionPayout.objects.filter(organization=org).order_by("-created_at")
