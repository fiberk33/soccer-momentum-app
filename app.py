import os
from flask import Flask, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

# This pulls the value you entered in Render's Environment settings
API_KEY = os.getenv("API_FOOTBALL_KEY")

@app.route("/api/live")
def get_live():
    # SAFETY CHECK: If Render can't find your key, it will tell you here
    if not API_KEY:
        return jsonify({"error": "Missing API Key in Render Environment"}), 500
    
    url = "https://api-football-v1.p.rapidapi.com/v3/fixtures"
    
    # CRITICAL: These headers must use the 'API_KEY' variable defined above
    headers = {
        "x-rapidapi-key": API_KEY,
        "x-rapidapi-host": "api-football-v1.p.rapidapi.com"
    }
    
    try:
        response = requests.get(url, headers=headers, params={"live": "all"}, timeout=10)
        return jsonify(response.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
