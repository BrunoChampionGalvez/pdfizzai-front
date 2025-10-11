# PDFizzAI — Frontend

URL pública: https://pdfizzai.vercel.app/

## Propósito
Permitir a los usuarios subir PDFs e interactuar con un asistente de IA que cita referencias clicables; al hacer clic, se resalta la fuente en el artículo original.

## Tech stack
- Next.js
- Tailwind CSS v4
- Paddle (payment gateway)
- NestJS (API)
- PostgreSQL
- OpenAI
- Gemini
- Pinecone

## Cómo correrlo localmente
Requisitos:
- Node.js 18+
- Backend en NestJS corriendo en http://localhost:3001
- Repositorio del backend: https://github.com/BrunoChampionGalvez/pdfizzai-back

Pasos:
1. Instalar dependencias: `npm install`
2. Copiar `.env.example` a `.env.local` y completar variables (ver “Configuración rápida”).
3. Iniciar en desarrollo: `npm run dev`
4. Abrir http://localhost:3000

## Configuración rápida (variables de entorno)
Crear un archivo `.env.local` con las siguientes variables:

- `NEXT_PUBLIC_API_URL`: URL del backend (por ejemplo, http://localhost:3001)
- `NEXT_PUBLIC_PADDLE_KEY`: publishable key de Paddle para el cliente

Ejemplo (`.env.local`):

```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_PADDLE_KEY=tu-publishable-key-de-paddle
```
