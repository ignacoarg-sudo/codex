# Bot de citas por WhatsApp + Google Calendar

Este proyecto crea un webhook para WhatsApp (Twilio) que:

1. Recibe solicitudes de cita por mensaje.
2. Revisa disponibilidad en Google Calendar.
3. Si hay espacio, agenda la cita y confirma al usuario.
4. Si no hay espacio, responde que no se agendó y sugiere horarios alternativos.
5. Siempre notifica el resultado por WhatsApp.
6. Incluye un link para que la persona agregue la cita en su Google Calendar.

## Formato de mensaje entrante

```text
CITA|AAAA-MM-DD|HH:mm|Nombre Apellido|correo@dominio.com
```

Ejemplo:

```text
CITA|2026-03-20|15:00|Ana Pérez|ana@mail.com
```

## Variables de entorno

Crea `.env`:

```bash
PORT=3000
TIMEZONE=America/Mexico_City
SLOT_MINUTES=30

GOOGLE_CLIENT_EMAIL=tu-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID=tu_calendario@group.calendar.google.com
```

## Configuración rápida

1. Crear proyecto en Google Cloud.
2. Habilitar Google Calendar API.
3. Crear Service Account y descargar credenciales.
4. Compartir el calendario objetivo con el correo de la Service Account.
5. Configurar Sandbox o número de Twilio WhatsApp.
6. En Twilio, configurar `WHEN A MESSAGE COMES IN` apuntando a:
   - `POST https://tu-dominio.com/webhook/whatsapp`

## Ejecutar

```bash
npm install
npm start
```

## Respuestas al usuario

- **Disponible**: “✅ Tu cita quedó agendada…”, link del evento + link para agregar en Google Calendar.
- **No disponible**: “❌ La cita NO quedó agendada…”, con alternativas cercanas.
- **Error técnico**: “⚠️ Ocurrió un error…”

## Siguiente mejora recomendada

Agregar una capa de NLP (por ejemplo, GPT function calling) para aceptar mensajes en lenguaje natural en lugar del formato fijo.
