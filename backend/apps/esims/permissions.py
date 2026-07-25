from rest_framework.permissions import BasePermission


class IsEsimOwner(BasePermission):
    def has_object_permission(self, request, view, obj):
        user = request.user
        return bool(user and user.is_authenticated and obj.order_item.order.user_id == user.id)
