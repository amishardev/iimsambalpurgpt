# IIM Sambalpur GPT 🎓

AI-powered assistant for IIM Sambalpur - Get instant answers about admissions, programs, placements, and campus life.

![IIM Sambalpur GPT](https://github.com/amishardev/iimsambalpurgpt/blob/main/image%203.png?raw=true)

## Features

- 🤖 **ChatGPT-like UI** - Familiar, intuitive interface
- 📚 **RAG-powered** - Retrieval-Augmented Generation using institute data
- 🔄 **API Key Rotation** - Automatic failover across 3 OpenRouter keys
- 🚫 **No Hallucinations** - Strict guardrails prevent invented facts
- 📝 **Source Attribution** - Every answer includes sources
- 🌙 **Dark Theme** - Beautiful dark interface matching Figma designs

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS
- **Backend**: Next.js API Routes
- **LLM**: OpenRouter (DeepSeek)
- **Vector DB**: Supabase pgvector (with local JSON fallback)
- **Styling**: Tailwind CSS with custom dark theme

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

Required environment variables:
- `OPENROUTER_KEY_1`, `OPENROUTER_KEY_2`, `OPENROUTER_KEY_3` - OpenRouter API keys
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

### 3. Set Up Supabase (Optional)

If using Supabase for vector storage:

1. Create a new Supabase project
2. Run the SQL from `scripts/supabase-setup.sql` in the SQL Editor
3. Add your Supabase credentials to `.env.local`

### 4. Ingest Dataset

Process the IIM Sambalpur dataset into searchable chunks:

```bash
npm run ingest
```

This creates:
- `data/chunks.json` - Chunked dataset for retrieval
- `data/ingest_report.json` - Ingestion statistics

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
├── app/
│   ├── api/chat/route.ts     # Chat API with RAG pipeline
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Main page
│   └── globals.css           # Global styles
├── components/
│   ├── Sidebar.tsx           # Navigation sidebar
│   ├── ChatInterface.tsx     # Main chat area
│   ├── Message.tsx           # Message bubbles
│   ├── MessageComposer.tsx   # Input area
│   └── SuggestionCards.tsx   # Home suggestions
├── lib/
│   ├── openrouter-client.ts  # API client with key rotation
│   ├── prompt-builder.ts     # RAG prompt construction
│   └── retrieval.ts          # Vector search
├── scripts/
│   ├── ingest-dataset.ts     # Data ingestion
│   └── supabase-setup.sql    # Database setup
└── data/
    └── chunks.json           # Processed dataset
```

## API Key Rotation

The system automatically rotates between 3 API keys when rate limited:

```typescript
// Automatic rotation on 429/401 errors
const response = await chatCompletion({
  model: 'deepseek/deepseek-chat',
  messages: [...],
});
```

## No-Hallucination Guardrails

Every response is governed by strict rules:
- Only uses information from retrieved context
- Cites sources for all facts
- Responds with "Based on available public IIM Sambalpur data, this information is not available." when uncertain

## Deployment

### Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

### Vercel

```bash
vercel deploy
```

## Testing

```bash
npm test
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run ingest` | Process dataset into chunks |
| `npm test` | Run tests |

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT

---

**Disclaimer**: Answers are generated from public IIM Sambalpur data. For official confirmation, refer to the [institute website](https://iimsambalpur.ac.in).
