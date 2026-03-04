# Sample Python views

from flask import Flask, jsonify, request
from .models import User, UserRepository

app = Flask(__name__)
repo = UserRepository("sqlite:///db.sqlite")


@app.route("/users", methods=["GET"])
def list_users():
    users = repo.list_active()
    return jsonify([u.to_dict() for u in users])


@app.route("/users", methods=["POST"])
def create_user():
    data = request.get_json()
    user = User(name=data["name"], email=data["email"])
    repo.add(user)
    return jsonify(user.to_dict()), 201
