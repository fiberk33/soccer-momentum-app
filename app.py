import os
from flask import Flask, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
# This allows Vercel to communicate with Render
CORS(app) 

# Fetches your key from the Render Environment settings
API_KEY = os.getenv("API_FOOTBALL_KEY")

@app.route("/api/live")
def get_live():
    # If the key is missing from Render settings, show this message
    if not API_KEY:
        return jsonify({"error": "Missing API Key"}), 500
    
    url = "https://api-football-v1.p.rapidapi.com/v3/fixtures"
    headers = {
        "x-rapidapi-key": API_KEY,
        "x-rapidapi-host": "api-football-v1.p.rapidapi.com"
    }
    
    try:
        # Pull live match data
        response = requests.get(url, headers=headers, params={"live": "all"}, timeout=10)
        return jsonify(response.json())
    except Exception as e:
        # If the API fails, show the specific error instead of crashing
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
