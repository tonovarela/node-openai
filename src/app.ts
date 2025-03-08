import express from 'express';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { marked } from 'marked'; 

dotenv.config();

const app = express();
const port = 3000;

app.use(express.json());

// Inicializa el cliente de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post('/ask', async (req: express.Request, res: express.Response):Promise<any> => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'La pregunta es obligatoria.' });
    }

    // 1. Obtener todos los asistentes
    const assistants = await openai.beta.assistants.list();

    if (!assistants || assistants.data.length === 0) {
      return res.status(404).json({ error: 'No se encontraron asistentes.' });
    }

    // 2. Seleccionar un asistente (por ejemplo, el primero de la lista)
    const assistant = assistants.data[0];

    // 3. Crear un hilo (thread) para la conversación
    const thread = await openai.beta.threads.create();

    // 4. Agregar una pregunta al hilo
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: question,
    });

    // 5. Ejecutar el asistente en el hilo
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
    });

    // Configurar el encabezado para el streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Función para enviar datos al cliente
    const sendData = (data: string) => {
      res.write(`data: ${data}\n\n`);
    };

    // 6. Esperar a que la ejecución termine y transmitir el estado
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id) as any;
    while (runStatus.status !== "completed" && runStatus.status !== "failed") {
      sendData(JSON.stringify({ status: runStatus.status }));
      await new Promise(r => setTimeout(r, 2000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id) as any;
    }

    if (runStatus.status === "failed") {
      console.error("La ejecución falló con error:", runStatus.last_error);
      sendData(JSON.stringify({ error: 'La ejecución del asistente falló.' }));
      return res.end();
    }

    // 7. Obtener la respuesta del asistente y transmitirla
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessages = messages.data.filter(msg => msg.role === "assistant");

    if (assistantMessages.length > 0) {
      const assistantResponse = assistantMessages[0].content[0];
      const response = (assistantResponse as any);
      const markdownText = marked( response.text.value);
      console.log("Respuesta del asistente:", response.text.value);
      sendData(JSON.stringify({ response: markdownText}));
    } else {
      sendData(JSON.stringify({ error: 'No se recibió respuesta del asistente.' }));
    }

    res.end();

  } catch (error: any) {
    console.error("Error:", error);
    //sendData(JSON.stringify({ error: 'Ocurrió un error al procesar la solicitud.' }));
    res.end();
  }
});

app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});