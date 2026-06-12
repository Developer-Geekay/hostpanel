"""
Domain Registry Persistence & Access Controller

This module manages the storage, loading, and access-control checks for domains
and subdomains registered in the control panel.

Features:
- Thread-safe loading and saving of the JSON files: `/opt/hostpanel/domains.json` and `/opt/hostpanel/subdomains.json`.
- Security ownership verification via `check_domain_access` to ensure non-admin users can only modify/view their own domains.
"""
import json
import os
from typing import List

from fastapi import HTTPException

DOMAINS_FILE    = "/opt/hostpanel/domains.json"
SUBDOMAINS_FILE = "/opt/hostpanel/subdomains.json"


def _load_domains() -> List[dict]:
    if not os.path.exists(DOMAINS_FILE):
        return []
    with open(DOMAINS_FILE, "r") as f:
        return json.load(f)


def _save_domains(domains: List[dict]):
    os.makedirs(os.path.dirname(DOMAINS_FILE), exist_ok=True)
    with open(DOMAINS_FILE, "w") as f:
        json.dump(domains, f, indent=2)


def _load_subdomains() -> List[dict]:
    if not os.path.exists(SUBDOMAINS_FILE):
        return []
    with open(SUBDOMAINS_FILE, "r") as f:
        return json.load(f)


def _save_subdomains(subdomains: List[dict]):
    os.makedirs(os.path.dirname(SUBDOMAINS_FILE), exist_ok=True)
    with open(SUBDOMAINS_FILE, "w") as f:
        json.dump(subdomains, f, indent=2)


def check_domain_access(domain_record: dict, current_user) -> None:
    if current_user.role != "admin" and domain_record.get("username") != current_user.linux_user:
        raise HTTPException(status_code=403, detail="Access denied")
