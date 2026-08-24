from django.urls import path

from .views import (
    DirectCheckoutView,
    DirectPromoPreviewView,
    CartItemDetailView,
    CartItemsView,
    CartPromoView,
    CartView,
    CheckoutView,
    OrderDetailView,
    OrderListView,
    OrderLookupView,
)

app_name = "orders"

urlpatterns = [
    path("cart/", CartView.as_view(), name="cart"),
    path("cart/items/", CartItemsView.as_view(), name="cart-items"),
    path("cart/items/<uuid:item_id>/", CartItemDetailView.as_view(), name="cart-item"),
    path("cart/promo-code/", CartPromoView.as_view(), name="cart-promo"),
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("checkout/direct/", DirectCheckoutView.as_view(), name="checkout-direct"),
    path("checkout/promo-preview/", DirectPromoPreviewView.as_view(), name="checkout-promo-preview"),
    path("orders/", OrderListView.as_view(), name="order-list"),
    path("orders/lookup/", OrderLookupView.as_view(), name="order-lookup"),
    path("orders/<uuid:id>/", OrderDetailView.as_view(), name="order-detail"),
]
