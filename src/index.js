import 'dotenv/config';
import express from 'express';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { google } from 'googleapis';
import twilio from 'twilio';

dayjs.extend(utc);
dayjs.extend(timezone);

const {
  PORT = 3000,
  TIMEZONE = 'America/Mexico_City',
  GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  GOOGLE_CALENDAR_ID,
  SLOT_MINUTES = '30'
} = process.env;

if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_CALENDAR_ID) {
  throw new Error('Faltan variables de Google Calendar en .env');
}

const googleAuth = new google.auth.JWT({
  email: GOOGLE_CLIENT_EMAIL,
  key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/calendar']
});

const calendar = google.calendar({ version: 'v3', auth: googleAuth });
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const parseRequest = (text = '') => {
  const clean = text.trim();
  // Formato esperado: CITA|2026-03-20|15:00|Nombre Apellido|email@dominio.com
  const [command, date, time, customerName, customerEmail] = clean.split('|').map((part) => part?.trim());

  if ((command || '').toUpperCase() !== 'CITA') {
    return { valid: false, reason: 'Formato inválido. Usa: CITA|AAAA-MM-DD|HH:mm|Nombre|correo@dominio.com' };
  }

  if (!date || !time || !customerName || !customerEmail) {
    return { valid: false, reason: 'Datos incompletos. Usa: CITA|AAAA-MM-DD|HH:mm|Nombre|correo@dominio.com' };
  }

  const start = dayjs.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', TIMEZONE);
  if (!start.isValid()) {
    return { valid: false, reason: 'Fecha u hora inválida. Ejemplo válido: CITA|2026-03-20|15:00|Ana|ana@mail.com' };
  }

  const end = start.add(Number(SLOT_MINUTES), 'minute');
  return {
    valid: true,
    start,
    end,
    customerName,
    customerEmail
  };
};

const toGoogleCalendarRenderLink = ({ title, details, start, end }) => {
  const encodeDate = (d) => d.tz('UTC').format('YYYYMMDDTHHmmss[Z]');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details,
    dates: `${encodeDate(start)}/${encodeDate(end)}`
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

const findAvailability = async ({ start, end }) => {
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone: TIMEZONE,
      items: [{ id: GOOGLE_CALENDAR_ID }]
    }
  });

  const busySlots = response.data.calendars?.[GOOGLE_CALENDAR_ID]?.busy || [];
  return busySlots.length === 0;
};

const suggestNextSlots = async ({ start, attempts = 4 }) => {
  const suggestions = [];
  let cursor = start.add(Number(SLOT_MINUTES), 'minute');

  while (suggestions.length < attempts) {
    const candidateEnd = cursor.add(Number(SLOT_MINUTES), 'minute');
    const isFree = await findAvailability({ start: cursor, end: candidateEnd });

    if (isFree) {
      suggestions.push(cursor);
    }

    cursor = cursor.add(Number(SLOT_MINUTES), 'minute');
  }

  return suggestions;
};

const createAppointment = async ({ start, end, customerName, customerEmail, waNumber }) => {
  const title = `Cita con ${customerName}`;
  const details = `Reservada desde WhatsApp (${waNumber}).`;

  const created = await calendar.events.insert({
    calendarId: GOOGLE_CALENDAR_ID,
    requestBody: {
      summary: title,
      description: details,
      start: {
        dateTime: start.toISOString(),
        timeZone: TIMEZONE
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: TIMEZONE
      },
      attendees: [{ email: customerEmail }]
    },
    sendUpdates: 'all'
  });

  const addToMyCalendarLink = toGoogleCalendarRenderLink({
    title,
    details,
    start,
    end
  });

  return {
    eventLink: created.data.htmlLink,
    addToMyCalendarLink
  };
};

app.post('/webhook/whatsapp', async (req, res) => {
  const incomingText = req.body.Body;
  const waNumber = req.body.From;
  const twiml = new twilio.twiml.MessagingResponse();

  const parsed = parseRequest(incomingText);
  if (!parsed.valid) {
    twiml.message(parsed.reason);
    return res.type('text/xml').send(twiml.toString());
  }

  try {
    const isFree = await findAvailability(parsed);

    if (!isFree) {
      const suggestions = await suggestNextSlots(parsed);
      const alternatives = suggestions
        .map((slot) => `• ${slot.tz(TIMEZONE).format('DD/MM/YYYY HH:mm')}`)
        .join('\n');

      twiml.message(
        `❌ La cita NO quedó agendada, ese horario ya está ocupado.\n\n` +
          `Horarios disponibles cercanos:\n${alternatives}\n\n` +
          `Responde con el mismo formato para reservar uno.`
      );

      return res.type('text/xml').send(twiml.toString());
    }

    const { eventLink, addToMyCalendarLink } = await createAppointment({
      ...parsed,
      waNumber
    });

    twiml.message(
      `✅ Tu cita quedó agendada para ${parsed.start.tz(TIMEZONE).format('DD/MM/YYYY HH:mm')}.\n\n` +
        `Ver evento: ${eventLink}\n` +
        `Agregar a tu Google Calendar: ${addToMyCalendarLink}`
    );

    return res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error(error);
    twiml.message('⚠️ Ocurrió un error al procesar tu cita. Intenta nuevamente en unos minutos.');
    return res.type('text/xml').send(twiml.toString());
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Bot de citas activo en http://localhost:${PORT}`);
});
