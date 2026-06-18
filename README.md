# 🚀 RAG-Chatbot-Starter

Build and deploy a production-ready AI chatbot in minutes.

**RAG-Chatbot-Starter** is an open-source starter kit that allows developers, startups, and businesses to quickly launch AI-powered chatbots using their own API keys. Simply configure your preferred AI provider, customize the branding, upload your knowledge base, and deploy.

No complex setup. No vendor lock-in. Bring your own model and data.

---

## ✨ Features

### 🤖 AI Chatbot

* OpenAI-compatible API support
* **Seamless Google Gemini API support with zero-dependency fallback**
* Streaming responses
* Conversation history
* Multi-turn conversations
* Markdown rendering
* Code syntax highlighting
* **Export chat history to Markdown (.md) with one click**

### 📚 RAG (Retrieval-Augmented Generation)

* **Bulk drag-and-drop multi-file uploads**
* Upload PDF documents, TXT files, and Markdown files
* **Real-time background chunking and indexing**
* Knowledge base search
* Context-aware responses
* Source citations with similarity relevance indicators

### 🎨 Branding & Customization

* Custom logo
* Custom chatbot name
* Custom colors
* Light/Dark mode
* Custom welcome message
* Custom favicon

### 🔐 Security

* API keys stored securely
* Environment variable support
* User authentication support
* Session management
* **Thread-safe database RLock protection for concurrent traffic**

### 🚀 Deployment Ready

* Docker support
* Cloud deployment support
* Self-hosting support
* Local development support

### 🛠 Developer Friendly

* Clean project structure
* Easy configuration
* Environment-based settings
* Extensible architecture
* Open-source

---

# 📸 Screenshots

Coming soon...

Feel free to contribute screenshots after deploying your own chatbot.

---

# 🎯 Use Cases

### Customer Support Chatbot

Train the chatbot on your documentation and let customers get instant answers.

### Internal Company Assistant

Provide employees with a searchable knowledge base.

### SaaS AI Assistant

Add AI capabilities to your product with minimal effort.

### Educational Chatbot

Create a tutor trained on custom learning materials.

### Document Q&A

Upload documents and ask questions directly from your knowledge base.

### Startup MVP

Launch an AI-powered product quickly.

---

# 🏗 Architecture

```text
User
 │
 ▼
Frontend UI
 │
 ▼
Backend API
 │
 ├── LLM Provider (OpenAI, Azure OpenAI, etc.)
 │
 └── Vector Database
      │
      └── Knowledge Base Documents
```

---

# 📂 Project Structure

```text
RAG-Chatbot-Starter/

├── frontend/
│   ├── components/
│   ├── pages/
│   ├── assets/
│   └── styles/
│
├── backend/
│   ├── api/
│   ├── services/
│   ├── rag/
│   ├── models/
│   └── utils/
│
├── data/
│   └── documents/
│
├── docker/
│
├── tests/
│
├── .env.example
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

# ⚙️ Installation

## Clone Repository

```bash
git clone https://github.com/your-username/RAG-Chatbot-Starter.git

cd RAG-Chatbot-Starter
```

---

## Create Virtual Environment

```bash
python -m venv venv
```

### Windows

```bash
venv\Scripts\activate
```

### Linux / macOS

```bash
source venv/bin/activate
```

---

## Install Dependencies

```bash
pip install -r requirements.txt
```

---

# 🔑 Configuration

Create a `.env` file from the example:

```bash
copy .env.example .env
```

### Environment Variables Settings

```env
# AI Provider Credentials (OpenAI or Google Gemini)
# Provide either your OpenAI key OR your Google Gemini API Key.
# If OPENAI_API_KEY is left blank and GEMINI_API_KEY is provided, the chatbot runs completely on Gemini!
OPENAI_API_KEY=
OPENAI_API_BASE=https://api.openai.com/v1

GEMINI_API_KEY=your_gemini_api_key_here

# AI Model Configuration
# Defaults below auto-swap to gemini-1.5-flash and text-embedding-004 under Gemini fallback
MODEL_NAME=gpt-4o-mini
EMBEDDING_MODEL_NAME=text-embedding-3-small

# Custom Chatbot Branding
CHATBOT_NAME="My AI Assistant"
PRIMARY_COLOR=#2563eb
WELCOME_MESSAGE="Hello! I am your AI assistant, trained on your custom knowledge base. How can I help you today?"

# RAG Toggle
ENABLE_RAG=true

# Security (Admin password for dynamic file manager console)
ADMIN_PASSWORD=admin123
JWT_SECRET=super_secret_jwt_signing_key_change_me_in_production
```

### ♊ Google Gemini API Fallback

If you do not have an OpenAI API key, you can run the entire RAG Chatbot on Google Gemini models completely out-of-the-box. There is **no need** to install heavy generative AI libraries; the application leverages Google's official OpenAI-compatible interface dynamically.

#### How to Enable Gemini:
1. Open your `.env` file.
2. Leave `OPENAI_API_KEY` completely blank (or remove it).
3. Paste your Gemini API key in `GEMINI_API_KEY`:
   ```env
   OPENAI_API_KEY=
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
4. Start the server! The system will automatically detect the key, redirect all calls to `https://generativelanguage.googleapis.com/v1beta/openai/`, and swap default model configurations:
   * **Chat Model**: Swapped from `gpt-4o-mini` to `gemini-1.5-flash`
   * **Embeddings Model**: Swapped from `text-embedding-3-small` to `text-embedding-004` (768 dimensions)

#### Supported Gemini Models:
You can customize the chat model by updating `MODEL_NAME` in your `.env` file to any OpenAI-compatible Gemini model names, such as:
* `gemini-1.5-flash` (Fast, cost-efficient, recommended)
* `gemini-1.5-pro` (Highly analytical and reasoning-heavy)
* `gemini-2.5-flash` (Next-gen speed and capability)

> [!WARNING]
> **Switching Providers (OpenAI ↔ Gemini)**: If you switch your active AI provider after already index-uploading documents, you **must clear your local database** by deleting `data/vector_store.json`. Because OpenAI embeddings use 1536 dimensions and Google Gemini embeddings use 768 dimensions, mixing them in the same vector database will cause dimension mismatch math exceptions!

---

# 🚀 Run Locally

Ensure you have your virtual environment activated:

```bash
# Windows
.\venv\Scripts\activate

# Linux / macOS
source venv/bin/activate
```

Start the application server:

```bash
python app.py
```

Open your browser and navigate to:

```text
http://localhost:8000
```

*   **Frontend UI + API Router**: Served at `http://localhost:8000/`
*   **Interactive API Docs**: View dynamic Swagger documentation at `http://localhost:8000/docs`

---

# 📚 Adding Knowledge Base Documents

**RAG-Chatbot-Starter** features an integrated, real-time administrative document manager. 

### 1. Uploading via Sidebar UI (Recommended)
1. In your browser at `http://localhost:8000`, click **Unlock Admin** in the bottom-left sidebar.
2. Enter your `ADMIN_PASSWORD` (default: `admin123`).
3. Drag-and-drop or select any PDF, TXT, or Markdown files.
4. The server will automatically chunk, generate embeddings, and index the file **in the background instantly**!
5. In case of API connection or key errors, the UI will report the failure details immediately.

### 2. Manual Uploading via Ingestion CLI
If you prefer managing documents manually:
1. Place your files inside the documents folder:
   ```text
   data/documents/
   ```
   Supported formats: PDF, TXT, Markdown.
2. Run the ingestion script to manually index them:
   ```bash
   python ingest.py
   ```

---

# 🎨 Custom Branding

## Change Logo

Replace the logo file with your custom brand icon:

```text
frontend/assets/logo.png
```

*Note: If no custom logo is supplied, the chatbot displays a neat dynamic SVG letter icon placeholder automatically.*

---

## Change Chatbot Name

Update the branding name displayed on the header, welcome panel, and tabs:

```env
CHATBOT_NAME="My Company Assistant"
```

---

## Change Theme Color

Update the primary colors used across sliders, floating message bubbles, and action buttons. The frontend will dynamically extract HEX codes and override styling instantly:

```env
PRIMARY_COLOR=#0ea5e9
```

---

## Change Welcome Message

Update the greeting message displayed to users on clean chat session openings:

```env
WELCOME_MESSAGE="Welcome to our Support Portal! Ask me anything."
```

---

# 🐳 Docker Deployment

Build image:

```bash
docker build -t rag-chatbot .
```

Run container:

```bash
docker run -p 8000:8000 rag-chatbot
```

---

## Docker Compose

```bash
docker-compose up -d
```

---

# ☁️ Deployment Options

Supported platforms:

* AWS
* Azure
* Google Cloud
* DigitalOcean
* Railway
* Render
* Fly.io
* VPS Servers

---

# 🔌 Supported AI Providers

Any OpenAI-compatible endpoint.

Examples:

* **Google Gemini** (Zero-dependency native fallback!)
* OpenAI
* Azure OpenAI
* OpenRouter
* Groq
* Together AI
* DeepSeek
* Local LLMs

---

# 🛣 Roadmap

### Version 1.0

* Chat UI
* OpenAI integration
* Branding customization
* Chat history

### Version 1.5

* PDF Upload
* Vector Search
* Source References

### Version 2.0

* Authentication
* Multi-user support
* Analytics Dashboard

### Version 3.0

* Team Workspaces
* API Access
* SaaS Mode

### Version 4.0

* Voice Assistant
* WhatsApp Integration
* Slack Integration

---

# 🤝 Contributing

Contributions are welcome.

Steps:

1. Fork repository
2. Create feature branch
3. Commit changes
4. Push changes
5. Open Pull Request

Please ensure:

* Code is documented
* Tests pass
* Pull request includes description

---

# 🐛 Reporting Issues

Found a bug?

Open an issue with:

* Description
* Reproduction steps
* Expected behavior
* Screenshots (if applicable)

---

# ⭐ Support

If you find this project useful:

* Star the repository
* Share it with others
* Contribute improvements
* Submit feature requests

---

# 📄 License

This project is licensed under the MIT License.

You are free to use, modify, distribute, and build commercial products using this project.

---

# 🙌 Acknowledgements

Thanks to the open-source community and AI ecosystem for making projects like this possible.

Special thanks to everyone who contributes to improving this repository.

---

# 👨‍💻 Author

Deep Patel

AI Engineer | Python Developer | Generative AI Enthusiast

If this project helped you, consider giving it a ⭐ on GitHub. Also Follow me on Github

<img width="800" height="449" alt="ezgif-67fd456ce93ece28" src="https://github.com/user-attachments/assets/b74039a7-0777-45a9-ba19-16522f7d5a21" />
