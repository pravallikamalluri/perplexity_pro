import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from dotenv import load_dotenv
import PyPDF2
import io

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app)  # Enable CORS for frontend communication

@app.route("/")
def index():
    return app.send_static_file("index.html")

# Global store for PDF context (Simple RAG memory)
pdf_context = ""

# Initialize Google GenAI client
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

@app.route('/api/upload', methods=['POST'])
def upload_file():
    global pdf_context
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
            
        if file and file.filename.endswith('.pdf'):
            # Read PDF using PyPDF2
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(file.read()))
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
            
            pdf_context = text
            print(f"PDF Uploaded: {len(text)} characters extracted.")
            return jsonify({"status": "success", "message": f"Successfully parsed {len(pdf_reader.pages)} pages."})
        
        return jsonify({"error": "Unsupported file type"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health():
    """Diagnostic check for the API status"""
    try:
        # Check gemini-flash-latest for baseline availability
        client.models.generate_content(model="gemini-flash-latest", contents="test")
        return jsonify({"status": "connected", "model": "gemini-flash-latest"})
    except Exception as e:
        return jsonify({"status": "failed", "error": str(e)}), 200

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        user_message = data.get("message")
        history = data.get("history", []) # Expected format: [{"role": "user", "parts": "hi"}, ...]
        
        if not user_message:
            return jsonify({"error": "No message provided"}), 400

        # Construct the conversational context
        contents = []
        
        # Add a system-level role for the PDF if it exists
        system_instruction = "You are a helpful AI assistant. Answer the user's questions clearly based on the provided PDF context and your general knowledge."
        if pdf_context:
            system_instruction += f"\n\n[DOCUMENT CONTEXT FOR RETRIEVAL]:\n\n{pdf_context[:5000]}..." # Reduced further to 5k to stay under strict quotas
        
        for msg in history:
            contents.append({
                "role": msg["role"],
                "parts": [{"text": msg["parts"]}]
            })
        
        # Prepend the system/PDF instruction to the current query for RAG
        final_query = f"{system_instruction}\n\nUser Question: {user_message}"
        
        # Append latest user message with PDF context
        contents.append({
            "role": "user",
            "parts": [{"text": final_query}]
        })

        # Expanded fallback list for maximum resilience
        models_to_try = [
            "gemini-2.5-flash", 
            "gemini-2.0-flash", 
            "gemini-2.0-flash-lite-001", # High availability lite model
            "gemini-flash-latest",
            "gemma-3-4b-it" # Uses a separate quota typically
        ]
        
        last_error = ""
        for model in models_to_try:
            try:
                print(f"Attempting conversational search with: {model}")
                response = client.models.generate_content(
                    model=model, 
                    contents=contents
                )
                return jsonify({
                    "response": response.text,
                    "model": model,
                    "status": "success"
                })
            except Exception as e:
                last_error = str(e)
                print(f"Model {model} failed: {last_error}")
                if "RESOURCE_EXHAUSTED" in last_error:
                    continue 
                break 

        return jsonify({
            "error": "Quota Exceeded: All available models have reached their free-tier limits.",
            "diagnostic": last_error
        }), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Run Flask app on port 5000
    app.run(debug=True, port=5000)
