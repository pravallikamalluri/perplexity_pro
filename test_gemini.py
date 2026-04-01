from google import genai
import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
print(f"Testing with key: {api_key[:10]}...")

try:
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents="hi"
    )
    print(f"Success! Response: {response.text}")
except Exception as e:
    print(f"FAILED with error: {e}")
    print(f"Type: {type(e)}")
