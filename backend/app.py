from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime

load_dotenv()
app = Flask(__name__)
CORS(app)

GMAIL_ADDRESS = os.getenv('GMAIL_ADDRESS')
GMAIL_APP_PASSWORD = os.getenv('GMAIL_APP_PASSWORD')
OWNER_EMAIL = os.getenv('OWNER_EMAIL')


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


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
