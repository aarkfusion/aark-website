from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import smtplib
import os
import base64
import json
import secrets
import requests
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime

load_dotenv()
app = Flask(__name__)
CORS(app)

GMAIL_ADDRESS = os.getenv('GMAIL_ADDRESS')
GMAIL_APP_PASSWORD = os.getenv('GMAIL_APP_PASSWORD')
OWNER_EMAIL = os.getenv('OWNER_EMAIL')

# Admin inventory editor — gated by ADMIN_PASSWORD. Commits inventory.json
# to GitHub on save so GitHub Pages republishes the live site.
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD')
GITHUB_TOKEN   = os.getenv('GITHUB_TOKEN')
GITHUB_REPO    = os.getenv('GITHUB_REPO', 'aarkfusion/aark-website')
GITHUB_BRANCH  = os.getenv('GITHUB_BRANCH', 'main')
INVENTORY_PATH = 'inventory.json'


def send_email(to_email, subject, html_body):
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = GMAIL_ADDRESS
    msg['To'] = to_email
    msg.attach(MIMEText(html_body, 'html'))
    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
        server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        server.sendmail(GMAIL_ADDRESS, to_email, msg.as_string())


def build_owner_email(d):
    mailto_body = (
        f"Dear {d['customer_name']},%0D%0A%0D%0A"
        "Great news! We have verified your payment and your order is now being processed.%0D%0A%0D%0A"
        f"Order ID: {d['order_id']}%0D%0A"
        f"Total: Rs.{d['order_total']}%0D%0A%0D%0A"
        "Expected dispatch: 3-5 business days.%0D%0A%0D%0A"
        "Thank you for shopping with AARK!%0D%0A%0D%0A"
        "Warm regards,%0D%0AAARK Team"
    )
    mailto_subject = f"Your AARK Order {d['order_id']} is Being Processed"

    return f"""
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f9f7f3;">
  <div style="background: #008080; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: #f9f7f3; margin: 0; font-size: 24px; letter-spacing: 3px;">AARK</h1>
    <p style="color: #c4a050; margin: 8px 0 0; letter-spacing: 1px;">New Order Received</p>
  </div>
  <div style="background: white; padding: 32px; border: 1px solid #e8e4dc;">
    <h2 style="color: #1a1a1a; border-bottom: 2px solid #A37E2C; padding-bottom: 8px;">Order #{d['order_id']}</h2>
    <p style="color: #666; font-size: 14px;">Received on: {d['date']}</p>

    <h3 style="color: #008080; margin-top: 24px;">Customer Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #666; width: 40%;">Name</td><td style="padding: 6px 0; color: #1a1a1a; font-weight: bold;">{d['customer_name']}</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Email</td><td style="padding: 6px 0; color: #1a1a1a;">{d['customer_email']}</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Phone</td><td style="padding: 6px 0; color: #1a1a1a;">{d['customer_phone']}</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Address</td><td style="padding: 6px 0; color: #1a1a1a;">{d['customer_address']}</td></tr>
    </table>

    <h3 style="color: #008080; margin-top: 24px;">Order Details</h3>
    <div style="background: #f9f7f3; padding: 16px; border-radius: 4px; white-space: pre-line; color: #333;">{d['order_items']}</div>
    <p style="font-size: 20px; font-weight: bold; color: #1a1a1a; text-align: right; margin-top: 16px;">Total: &#8377;{d['order_total']}</p>

    <h3 style="color: #008080; margin-top: 24px;">Payment Reference (UTR)</h3>
    <div style="background: #1a1a1a; color: #c4a050; padding: 16px; border-radius: 4px; font-size: 20px; text-align: center; letter-spacing: 4px; font-family: monospace;">{d['utr_number']}</div>

    <div style="margin-top: 32px; padding: 20px; background: #e0f5f5; border-radius: 8px; border-left: 4px solid #008080;">
      <p style="margin: 0 0 12px; color: #1a1a1a; font-weight: bold;">&#10003; Once you verify this UTR in your bank app, notify the customer:</p>
      <a href="mailto:{d['customer_email']}?subject={mailto_subject}&body={mailto_body}"
         style="display: inline-block; background: #008080; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;">
        Send Processing Email to Customer
      </a>
    </div>
  </div>
  <div style="background: #1a1a1a; padding: 16px; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="color: #c4a050; margin: 0; font-size: 12px; letter-spacing: 2px;">AARK — Tradition, Styled for Today</p>
  </div>
</div>
"""


def build_customer_email(d):
    return f"""
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f9f7f3;">
  <div style="background: #008080; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: #f9f7f3; margin: 0; font-size: 24px; letter-spacing: 3px;">AARK</h1>
    <p style="color: #c4a050; margin: 8px 0 0; letter-spacing: 1px;">Order Confirmation</p>
  </div>
  <div style="background: white; padding: 32px; border: 1px solid #e8e4dc;">
    <h2 style="color: #1a1a1a;">Thank you, {d['customer_name']}! &#127881;</h2>
    <p style="color: #444; line-height: 1.7;">We have received your order and your payment reference number. Our team is currently verifying your payment — this usually takes a few hours during business hours.</p>

    <div style="background: #f9f7f3; border: 1px solid #A37E2C; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 8px; color: #666; font-size: 13px; letter-spacing: 1px; text-transform: uppercase;">Your Order ID</p>
      <p style="margin: 0; font-size: 22px; font-weight: bold; color: #008080; letter-spacing: 2px;">{d['order_id']}</p>
    </div>

    <h3 style="color: #008080;">Order Summary</h3>
    <div style="background: #f9f7f3; padding: 16px; border-radius: 4px; white-space: pre-line; color: #333;">{d['order_items']}</div>
    <p style="font-size: 18px; font-weight: bold; color: #1a1a1a; text-align: right;">Total Paid: &#8377;{d['order_total']}</p>
    <p style="color: #666; font-size: 13px; text-align: right;">UPI Ref: {d['utr_number']}</p>

    <div style="background: #fffbef; border-left: 4px solid #A37E2C; padding: 16px; margin-top: 24px; border-radius: 0 4px 4px 0;">
      <p style="margin: 0; color: #1a1a1a;"><strong>What happens next?</strong></p>
      <p style="margin: 8px 0 0; color: #555; line-height: 1.6;">Once we verify your payment, you will receive another email confirming your order is being processed. Expected dispatch is 3&#8211;5 business days after confirmation.</p>
    </div>

    <div style="text-align: center; margin-top: 32px;">
      <a href="https://wa.me/919000107301?text=Hi+AARK,+my+Order+ID+is+{d['order_id']}+and+I+need+help."
         style="display: inline-block; background: #008080; color: white; padding: 12px 28px; border-radius: 24px; text-decoration: none; font-weight: bold;">
        Message us on WhatsApp
      </a>
    </div>
  </div>
  <div style="background: #1a1a1a; padding: 16px; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="color: #c4a050; margin: 0; font-size: 12px; letter-spacing: 2px;">AARK — Tradition, Styled for Today</p>
    <p style="color: #666; margin: 6px 0 0; font-size: 11px;">sales.aarkfusion@gmail.com</p>
  </div>
</div>
"""


@app.route('/', methods=['GET'])
def health():
    return jsonify({"status": "AARK backend is live"}), 200


@app.route('/place-order', methods=['POST'])
def place_order():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data received"}), 400

        required = ['order_id', 'customer_name', 'customer_email', 'customer_phone',
                    'customer_address', 'order_items', 'order_total', 'utr_number', 'date']
        for field in required:
            if not data.get(field):
                return jsonify({"error": f"Missing field: {field}"}), 400

        warnings = []

        # Email to owner
        try:
            owner_subject = f"New AARK Order — {data['order_id']}"
            owner_html = build_owner_email(data)
            send_email(OWNER_EMAIL, owner_subject, owner_html)
            print(f"Owner email sent for order {data['order_id']}")
        except Exception as e:
            warnings.append(f"Owner email failed: {str(e)}")
            print(f"ERROR sending owner email: {e}")

        # Email to customer
        try:
            customer_subject = f"Your AARK Order {data['order_id']} — Payment Received"
            customer_html = build_customer_email(data)
            send_email(data['customer_email'], customer_subject, customer_html)
            print(f"Customer email sent to {data['customer_email']}")
        except Exception as e:
            warnings.append(f"Customer email failed: {str(e)}")
            print(f"ERROR sending customer email: {e}")

        # Auto-deduct sold qty from inventory.json on GitHub. Never blocks the
        # order — on failure we attach a warning and email the owner so they
        # can reconcile manually.
        cart_items = data.get('cart_items')
        if cart_items:
            ok, detail = _deduct_inventory_for_order(cart_items, data['order_id'])
            if not ok:
                warnings.append(f"Inventory auto-deduct failed: {detail}")
                print(f"ERROR auto-deducting inventory: {detail}")
                try:
                    alert_html = (
                        f"<p>Order <b>{data['order_id']}</b> placed, but the automatic "
                        f"inventory deduction failed.</p><p>Reason: {detail}</p>"
                        f"<p>Please update inventory.json manually for: "
                        f"<pre>{json.dumps(cart_items, indent=2)}</pre></p>"
                    )
                    send_email(OWNER_EMAIL,
                               f"AARK: manual inventory reconciliation needed for {data['order_id']}",
                               alert_html)
                except Exception as alert_err:
                    print(f"ERROR sending reconciliation alert: {alert_err}")

        response = {
            "success": True,
            "order_id": data['order_id'],
            "message": "Order placed successfully"
        }
        if warnings:
            response["warnings"] = warnings

        return jsonify(response), 200

    except Exception as e:
        print(f"CRITICAL ERROR in place_order: {e}")
        return jsonify({"error": "Server error", "detail": str(e)}), 500


def build_contact_email(d):
    phone_line = f"<tr><td style='padding:6px 0;color:#666;width:40%;'>Phone</td><td style='padding:6px 0;color:#1a1a1a;'>{d['phone']}</td></tr>" if d.get('phone') else ''
    return f"""
<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f9f7f3;">
  <div style="background: #008080; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: #f9f7f3; margin: 0; font-size: 24px; letter-spacing: 3px;">AARK</h1>
    <p style="color: #c4a050; margin: 8px 0 0; letter-spacing: 1px;">New Website Enquiry</p>
  </div>
  <div style="background: white; padding: 32px; border: 1px solid #e8e4dc;">
    <h2 style="color: #1a1a1a; border-bottom: 2px solid #A37E2C; padding-bottom: 8px; margin-bottom: 20px;">
      {d['subject']}
    </h2>
    <h3 style="color: #008080; margin-bottom: 12px;">From</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr><td style="padding: 6px 0; color: #666; width: 40%;">Name</td><td style="padding: 6px 0; color: #1a1a1a; font-weight: bold;">{d['name']}</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Email</td><td style="padding: 6px 0;"><a href="mailto:{d['email']}" style="color: #008080;">{d['email']}</a></td></tr>
      {phone_line}
      <tr><td style="padding: 6px 0; color: #666;">Sent at</td><td style="padding: 6px 0; color: #1a1a1a;">{d.get('submitted_at', '')}</td></tr>
    </table>
    <h3 style="color: #008080; margin-bottom: 12px;">Message</h3>
    <div style="background: #f9f7f3; border-left: 4px solid #008080; padding: 16px 20px; border-radius: 0 6px 6px 0; color: #333; line-height: 1.7; white-space: pre-wrap;">{d['message']}</div>
    <div style="margin-top: 28px; text-align: center;">
      <a href="mailto:{d['email']}?subject=Re: {d['subject']}"
         style="display: inline-block; background: #008080; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">
        Reply to {d['name']}
      </a>
    </div>
  </div>
  <div style="background: #1a1a1a; padding: 16px; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="color: #c4a050; margin: 0; font-size: 12px; letter-spacing: 2px;">AARK — Tradition, Styled for Today</p>
  </div>
</div>
"""


@app.route('/contact', methods=['POST'])
def contact():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data received"}), 400

        for field in ['name', 'email', 'subject', 'message']:
            if not data.get(field):
                return jsonify({"error": f"Missing field: {field}"}), 400

        subject = f"AARK Enquiry — {data['subject']} from {data['name']}"
        html = build_contact_email(data)
        send_email(OWNER_EMAIL, subject, html)
        print(f"Contact email sent from {data['email']}")

        return jsonify({"success": True, "message": "Message sent successfully"}), 200

    except Exception as e:
        print(f"Contact form error: {e}")
        return jsonify({"error": "Server error", "detail": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# Admin inventory editor
#
# Auth model: the employee enters ADMIN_PASSWORD on admin.html; the page sends
# it as `Authorization: Bearer <password>` on every admin request. The password
# lives only in Render env vars and in the employee's sessionStorage — never
# in client source. GitHub PAT stays server-side and is used only to commit
# inventory.json on save.
# ─────────────────────────────────────────────────────────────────────────────

def _require_admin(req):
    """Return None if request is authorised; otherwise return a Flask response tuple."""
    if not ADMIN_PASSWORD:
        return jsonify({"error": "Admin not configured on server"}), 503
    header = req.headers.get('Authorization', '')
    if not header.startswith('Bearer '):
        return jsonify({"error": "Unauthorized"}), 401
    supplied = header[len('Bearer '):]
    if not secrets.compare_digest(supplied, ADMIN_PASSWORD):
        return jsonify({"error": "Unauthorized"}), 401
    return None


def _github_headers():
    if not GITHUB_TOKEN:
        raise RuntimeError("GITHUB_TOKEN not set")
    return {
        'Authorization': f'Bearer {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    }


def _github_get_inventory():
    """Fetch inventory.json from GitHub. Returns (parsed_json, sha)."""
    url = f'https://api.github.com/repos/{GITHUB_REPO}/contents/{INVENTORY_PATH}'
    r = requests.get(url, headers=_github_headers(), params={'ref': GITHUB_BRANCH}, timeout=15)
    r.raise_for_status()
    payload = r.json()
    content_b64 = payload.get('content', '')
    raw = base64.b64decode(content_b64).decode('utf-8')
    return json.loads(raw), payload.get('sha')


_ADULT_SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

def _size_rank(key):
    """Sort key for size labels — adult XS→XXL first, then kids by numeric age,
    then alphabetical fallback. `price` always sorts last."""
    if key == 'price':
        return (3, 0, '')
    if key in _ADULT_SIZE_ORDER:
        return (0, _ADULT_SIZE_ORDER.index(key), '')
    try:
        return (1, int(str(key).split('-')[0]), '')
    except (ValueError, IndexError):
        return (2, 0, key)


def _normalize_inventory(inv):
    """Return a new dict with SKUs sorted alphabetically and each row's keys
    in canonical size order (price last). Keeps the JSON file readable and
    consistent across admin saves and auto-deductions."""
    return {
        sku: {k: inv[sku][k] for k in sorted(inv[sku].keys(), key=_size_rank)}
        for sku in sorted(inv.keys())
    }


def _github_put_inventory(new_inventory, sha, commit_message):
    """Commit a new inventory.json. Returns the new SHA on success."""
    new_inventory = _normalize_inventory(new_inventory)
    url = f'https://api.github.com/repos/{GITHUB_REPO}/contents/{INVENTORY_PATH}'
    body_text = json.dumps(new_inventory, indent=2) + '\n'
    body = {
        'message': commit_message,
        'content': base64.b64encode(body_text.encode('utf-8')).decode('ascii'),
        'sha': sha,
        'branch': GITHUB_BRANCH,
    }
    r = requests.put(url, headers=_github_headers(), json=body, timeout=20)
    if r.status_code == 409:
        return None  # caller will surface a conflict message
    r.raise_for_status()
    return r.json().get('content', {}).get('sha')


def _deduct_inventory_for_order(cart_items, order_id):
    """Subtract sold qty from inventory.json on GitHub. Retries on SHA conflict.

    Returns (ok: bool, detail: str). Designed to NEVER raise — order placement
    must succeed even if the deduction fails. On failure the caller emails the
    owner so manual reconciliation is possible.
    """
    if not GITHUB_TOKEN:
        return False, "GITHUB_TOKEN not set on server"
    if not isinstance(cart_items, list) or not cart_items:
        return False, "No cart_items provided"

    for attempt in range(3):
        try:
            inv, sha = _github_get_inventory()
        except Exception as e:
            return False, f"GitHub fetch failed: {e}"

        for item in cart_items:
            sku  = (item or {}).get('sku')
            size = (item or {}).get('size')
            qty  = (item or {}).get('qty')
            if not sku or not size or not isinstance(qty, (int, float)) or qty <= 0:
                continue
            row = inv.get(sku)
            if not isinstance(row, dict) or size not in row:
                continue  # untracked SKU/size — skip silently
            current = row.get(size, 0)
            row[size] = max(0, int(current) - int(qty))

        commit_msg = f"Auto-deduct inventory for order {order_id}"
        try:
            new_sha = _github_put_inventory(inv, sha, commit_msg)
        except Exception as e:
            return False, f"GitHub commit failed: {e}"
        if new_sha:
            return True, "ok"
        # 409 conflict — someone else committed in between, retry with fresh SHA
    return False, "GitHub conflict after 3 retries"


@app.route('/admin/login', methods=['POST'])
def admin_login():
    if not ADMIN_PASSWORD:
        return jsonify({"error": "Admin not configured on server"}), 503
    data = request.get_json(silent=True) or {}
    supplied = data.get('password', '')
    if not isinstance(supplied, str) or not secrets.compare_digest(supplied, ADMIN_PASSWORD):
        return jsonify({"error": "Invalid password"}), 401
    return jsonify({"ok": True}), 200


@app.route('/admin/inventory', methods=['GET'])
def admin_get_inventory():
    auth_err = _require_admin(request)
    if auth_err:
        return auth_err
    try:
        inv, sha = _github_get_inventory()
        return jsonify({"inventory": inv, "sha": sha}), 200
    except requests.HTTPError as e:
        detail = e.response.text if e.response is not None else str(e)
        return jsonify({"error": "GitHub fetch failed", "detail": detail}), 502
    except Exception as e:
        return jsonify({"error": "Server error", "detail": str(e)}), 500


@app.route('/admin/inventory', methods=['POST'])
def admin_put_inventory():
    auth_err = _require_admin(request)
    if auth_err:
        return auth_err
    data = request.get_json(silent=True) or {}
    new_inv = data.get('inventory')
    client_sha = data.get('sha')
    if not isinstance(new_inv, dict) or not isinstance(client_sha, str):
        return jsonify({"error": "Body must include `inventory` (object) and `sha` (string)"}), 400

    # Server-side sanity: every value must be a dict; every leaf must be a non-negative number.
    for sku, row in new_inv.items():
        if not isinstance(row, dict):
            return jsonify({"error": f"SKU {sku} is not an object"}), 400
        for k, v in row.items():
            if not isinstance(v, (int, float)) or v < 0:
                return jsonify({"error": f"SKU {sku} key '{k}' must be a non-negative number"}), 400

    commit_message = f"Inventory update via admin — {datetime.utcnow().isoformat(timespec='seconds')}Z"
    try:
        new_sha = _github_put_inventory(new_inv, client_sha, commit_message)
        if new_sha is None:
            return jsonify({"error": "Conflict: someone else just saved. Reload and try again."}), 409
        return jsonify({"ok": True, "sha": new_sha}), 200
    except requests.HTTPError as e:
        detail = e.response.text if e.response is not None else str(e)
        return jsonify({"error": "GitHub commit failed", "detail": detail}), 502
    except Exception as e:
        return jsonify({"error": "Server error", "detail": str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
