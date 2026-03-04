# Sample Python models

from dataclasses import dataclass
from typing import List, Optional
import json

MAX_NAME_LENGTH = 100
DEFAULT_STATUS = "active"


@dataclass
class User:
    name: str
    email: str
    status: str = DEFAULT_STATUS

    def is_active(self) -> bool:
        return self.status == "active"

    def to_dict(self) -> dict:
        return {"name": self.name, "email": self.email, "status": self.status}

    def _validate(self) -> bool:
        return len(self.name) <= MAX_NAME_LENGTH


class UserRepository:
    """Repository for managing users."""

    users: List[User] = []

    def __init__(self, db_url: str):
        self.db_url = db_url
        self.users = []

    def add(self, user: User) -> None:
        self.users.append(user)

    def find_by_email(self, email: str) -> Optional[User]:
        for u in self.users:
            if u.email == email:
                return u
        return None

    def list_active(self) -> List[User]:
        return [u for u in self.users if u.is_active()]

    def count(self) -> int:
        return len(self.users)


__all__ = ["User", "UserRepository", "MAX_NAME_LENGTH"]
