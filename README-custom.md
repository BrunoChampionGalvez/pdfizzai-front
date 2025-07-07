# RefDoc AI Frontend

Frontend for RefDoc AI - an application for uploading PDFs and chatting with AI about their contents.

## Technologies

- Next.js: React framework for building server-rendered applications.
- Tailwind CSS: Utility-first CSS framework for rapidly building custom designs.
- Zustand: A small, fast and scalable state-management solution.
- React PDF: PDF viewer component for React.
- Axios: Promise based HTTP client for the browser and node.js.

## Features

- User authentication (signup, login, logout)
- File and folder management
- PDF upload and viewing
- AI-powered chat interface
- Referenced text highlighting
- Dark mode UI with custom color palette

## Getting Started

### Prerequisites

- Node.js (>=18.0.0)
- Backend API running (see backend README)

### Installation

1. Clone the repository

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env.local
```
Then edit the `.env.local` file with your API URL and other configuration.

4. Start the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app in your browser.

## Project Structure

- src/ - Source code
  - app/ - Next.js app router pages
  - components/ - React components
  - store/ - Zustand state stores
  - services/ - API service functions
  - lib/ - Utility functions
  - types/ - TypeScript type definitions

## Building for Production

```bash
npm run build
```

## License

This project is licensed under the MIT License.
