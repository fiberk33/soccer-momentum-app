import os
from flask import Flask, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
# This allows your Vercel site to talk to this Render backend
CORS(app)

# Pulls the key from your Render Environment Variables
# Ensure your Render Key is named "API_FOOTBALL_KEY"
API_KEY = os.getenv("API_FOOTBALL_KEY")

@app.route("/api/live")
def get_live():
    if not API_KEY:
        return jsonify({"error": "Missing API Key in Render Environment"}), 500
    
    # We are using the direct v3 API-Sports endpoint for your Pro Plan
    url = "https://v3.football.api-sports.io/fixtures"
    
    headers = {
        "x-apisports-key": API_KEY,
        "x-rapidapi-host": "v3.football.api-sports.io"
    }
    
    params = {"live": "all"}
    
    try:
        # Request data from the soccer servers
        response = requests.get(url, headers=headers, params=params, timeout=10)
        data = response.json()
        
        # Log status to Render console for debugging
        print(f"API Status: {response.status_code}")
        
        return jsonify(data)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Render requires the app to run on a specific port
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
