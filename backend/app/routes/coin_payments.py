"""Pagos Stripe para monedas internas.

This is deliberately sandbox-only. Success URLs never credit coins; the signed
Stripe webhook is the source of truth.
"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.models.economy import CoinPackage, CoinPurchase, CoinTransaction
from app.services.economy_services import CoinService, DomainError, StripePaymentService

coin_payments_bp = Blueprint("coin_payments", __name__)


def error_response(exc: DomainError):
    payload = {"error": exc.code, "message": str(exc), "status": exc.status}
    if getattr(exc, "details", None):
        payload["details"] = exc.details
        payload.update(exc.details)
    return jsonify(payload), exc.status


@coin_payments_bp.route("/coin-packages", methods=["GET"])
def coin_packages():
    StripePaymentService.ensure_default_packages()
    packages = CoinPackage.query.filter_by(is_active=True).order_by(CoinPackage.coins.asc()).all()
    return jsonify({
        "items": [package.to_dict() for package in packages],
        "mode": "test",
        "disclaimer": "Las monedas internas no tienen valor monetario real y no se pueden retirar.",
    }), 200


@coin_payments_bp.route("/coins/balance", methods=["GET"])
@jwt_required()
def coin_balance():
    # mcajamar - 19/04/2026: implementé wallet, saldo y movimientos para que las monedas quedaran registradas.
    user_id = int(get_jwt_identity())
    return jsonify({
        "balance": CoinService.get_balance(user_id),
        "disclaimer": "Monedas internas sin valor monetario real. No se pueden retirar.",
    }), 200


@coin_payments_bp.route("/coins/transactions", methods=["GET"])
@jwt_required()
def coin_transactions():
    user_id = int(get_jwt_identity())
    items = (
        CoinTransaction.query
        .filter_by(user_id=user_id)
        .order_by(CoinTransaction.created_at.desc())
        .limit(100)
        .all()
    )
    return jsonify({"items": [item.to_dict() for item in items]}), 200


@coin_payments_bp.route("/payments/stripe/create-checkout-session", methods=["POST"])
@coin_payments_bp.route("/payments/stripe/coin-checkout", methods=["POST"])
@jwt_required()
def create_coin_checkout():
    try:
        data = request.get_json(silent=True) or {}
        result = StripePaymentService.create_checkout_session(int(get_jwt_identity()), int(data.get("package_id")))
        return jsonify(result), 201
    except DomainError as exc:
        return error_response(exc)


@coin_payments_bp.route("/payments/stripe/webhook", methods=["POST"])
def stripe_coin_webhook():
    try:
        result = StripePaymentService.handle_webhook(request.get_data(), request.headers.get("Stripe-Signature"))
        return jsonify({"received": True, **result}), 200
    except DomainError as exc:
        return error_response(exc)


@coin_payments_bp.route("/payments/purchases", methods=["GET"])
@jwt_required()
def coin_purchase_history():
    items = CoinPurchase.query.filter_by(user_id=int(get_jwt_identity())).order_by(CoinPurchase.created_at.desc()).all()
    return jsonify({"items": [item.to_dict() for item in items]}), 200


@coin_payments_bp.route("/payments/purchases/<int:purchase_id>", methods=["GET"])
@jwt_required()
def coin_purchase_detail(purchase_id):
    purchase = CoinPurchase.query.filter_by(id=purchase_id, user_id=int(get_jwt_identity())).first_or_404()
    session_id = (request.args.get("session_id") or "").strip()
    if session_id and purchase.status == "pending":
        try:
            purchase = StripePaymentService.sync_checkout_session(int(get_jwt_identity()), purchase_id, session_id)
        except DomainError as exc:
            return error_response(exc)
    return jsonify(purchase.to_dict()), 200
