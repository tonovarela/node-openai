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

app.post('/ask', async (req: express.Request, res: express.Response): Promise<any> => {
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

    // 6. Esperar a que la ejecución termine
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id) as any;
    while (runStatus.status !== "completed" && runStatus.status !== "failed") {
      await new Promise(r => setTimeout(r, 2000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id) as any;
    }

    if (runStatus.status === "failed") {
      console.error("La ejecución falló con error:", runStatus.last_error);
      return res.status(500).json({ error: 'La ejecución del asistente falló.' });
    }

    // 7. Obtener la respuesta del asistente
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessages = messages.data.filter(msg => msg.role === "assistant");

    if (assistantMessages.length > 0) {
      const assistantResponse = assistantMessages[0].content[0];
      const response = (assistantResponse as any);
      const markdownText = marked(response.text.value);
      console.log("Respuesta del asistente:", response.text.value);
      return res.status(200).json({ response: markdownText });
    } else {
      return res.status(404).json({ error: 'No se recibió respuesta del asistente.' });
    }

  } catch (error: any) {
    console.error("Error:", error);
    return res.status(500).json({ error: 'Ocurrió un error al procesar la solicitud.' });
  }
});

app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});