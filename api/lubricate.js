function headers() {
    return {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Prefer': 'return=representation'
    };
}

function base() {
    return process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1';
}

function storageBase() {
    return process.env.SUPABASE_URL.replace(/\/$/, '') + '/storage/v1';
}

async function sb(path, opts = {}) {
    const response = await fetch(base() + path, {
        ...opts,
        headers: {
            ...headers(),
            ...(opts.headers || {})
        }
    });

    const text = await response.text();

    let data;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }

    if (!response.ok) {
        throw new Error(
            typeof data === 'string'
                ? data
                : (
                    data?.message ||
                    data?.hint ||
                    data?.details ||
                    'Erro no Supabase.'
                )
        );
    }

    return data;
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + Number(days || 0));
    return d.toISOString().slice(0, 10);
}

function safePart(value) {
    return String(value || 'sem-dado')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'sem-dado';
}

async function uploadPhoto(dataUrl, point, performedAt) {

    if (
        typeof dataUrl !== 'string' ||
        !dataUrl.startsWith('data:image/')
    ) {
        throw new Error(
            'A foto da lubrificação é obrigatória.'
        );
    }

    const match = dataUrl.match(
        /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i
    );

    if (!match) {
        throw new Error(
            'Formato de foto não suportado.'
        );
    }

    const mimeOriginal = match[1].toLowerCase();

    const mime =
        mimeOriginal === 'image/jpg'
            ? 'image/jpeg'
            : mimeOriginal;

    const buffer = Buffer.from(
        match[2],
        'base64'
    );

    if (!buffer.length) {
        throw new Error(
            'A foto está vazia.'
        );
    }

    if (buffer.length > 4 * 1024 * 1024) {
        throw new Error(
            'A foto ficou muito grande. Tente tirar outra foto.'
        );
    }

    const path = [
        safePart(point.sector),
        safePart(point.code),
        `${Date.now()}-${safePart(point.id)}.jpg`
    ].join('/');

    const encodedPath = path
        .split('/')
        .map(encodeURIComponent)
        .join('/');

    const response = await fetch(
        `${storageBase()}/object/lubrication-photos/${encodedPath}`,
        {
            method: 'POST',

            headers: {
                'apikey':
                    process.env.SUPABASE_SERVICE_ROLE_KEY,

                'Authorization':
                    'Bearer ' +
                    process.env.SUPABASE_SERVICE_ROLE_KEY,

                'Content-Type': mime,

                'x-upsert': 'false'
            },

            body: buffer
        }
    );

    const text = await response.text();

    if (!response.ok) {

        let data;

        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = text;
        }

        throw new Error(
            typeof data === 'string'
                ? data
                : (
                    data?.message ||
                    data?.error ||
                    'Não foi possível salvar a foto.'
                )
        );
    }

    return {
        path,
        uploaded_at: performedAt
    };
}

async function sendEmail(data) {

    const apiKey =
        process.env.RESEND_API_KEY;

    if (!apiKey) {
        console.log(
            'RESEND_API_KEY não configurada. E-mail não enviado.'
        );

        return null;
    }

    const response = await fetch(
        'https://api.resend.com/emails',
        {
            method: 'POST',

            headers: {
                'Authorization':
                    `Bearer ${apiKey}`,

                'Content-Type':
                    'application/json'
            },

            body: JSON.stringify({

                from:
                    'PCM • Lubrificação <pcm@abmadeiras.com.br>',

                to: [
                    'rena.simoes@abmadeiras.com.br',
                    'ery.soares@abmadeiras.com.br'
                ],

                subject:
                    `Lubrificação realizada - ${data.code}`,

                html: `
                    <div
                        style="
                            font-family:Arial,sans-serif;
                            max-width:700px;
                            margin:0 auto;
                            padding:20px
                        "
                    >

                        <h2>
                            PCM • Lubrificação
                        </h2>

                        <p>
                            <strong>
                                Lubrificação realizada com sucesso.
                            </strong>
                        </p>

                        <hr>

                        <p>
                            <strong>Máquina:</strong>
                            ${data.machine}
                        </p>

                        <p>
                            <strong>Código:</strong>
                            ${data.code}
                        </p>

                        <p>
                            <strong>Setor:</strong>
                            ${data.sector}
                        </p>

                        <p>
                            <strong>
                                Ponto de lubrificação:
                            </strong>
                            ${data.point}
                        </p>

                        <p>
                            <strong>Lubrificante:</strong>
                            ${data.lubricant}
                        </p>

                        <p>
                            <strong>Quantidade:</strong>
                            ${data.quantity}
                        </p>

                        <p>
                            <strong>Responsável:</strong>
                            ${data.responsible}
                        </p>

                        <p>
                            <strong>Data/hora:</strong>
                            ${data.performedAt}
                        </p>

                        <p>
                            <strong>
                                Próxima lubrificação:
                            </strong>
                            ${data.nextDate}
                        </p>

                        <hr>

                        <p
                            style="
                                color:#64748b;
                                font-size:12px
                            "
                        >
                            E-mail automático enviado pelo sistema
                            PCM • Lubrificação.
                        </p>

                    </div>
                `
            })
        }
    );

    const text =
        await response.text();

    let result;

    try {
        result =
            text
                ? JSON.parse(text)
                : {};
    } catch {
        result = {
            message: text
        };
    }

    if (!response.ok) {

        throw new Error(
            result?.message ||
            result?.error ||
            text ||
            'Erro ao enviar e-mail.'
        );
    }

    return result;
}

export default async function handler(req, res) {

    try {

        if (req.method !== 'POST') {

            return res
                .status(405)
                .json({
                    error:
                        'Método não permitido.'
                });
        }

        const {
            id,
            responsible,
            responsible_id = null,
            photoData = null
        } = req.body || {};

        if (!id) {

            return res
                .status(400)
                .json({
                    error:
                        'ID obrigatório.'
                });
        }

        if (!photoData) {

            return res
                .status(400)
                .json({
                    error:
                        'Tire a foto da lubrificação antes de concluir.'
                });
        }

        const rows =
            await sb(
                `/lubrication_points?id=eq.${encodeURIComponent(id)}&select=*`
            );

        const point =
            rows?.[0];

        if (!point) {

            return res
                .status(404)
                .json({
                    error:
                        'Ponto de lubrificação não encontrado.'
                });
        }

        const performedAt =
            new Date().toISOString();

        const nextDate =
            addDays(
                performedAt,
                point.frequency_days
            );

        /*
         * PRIMEIRO SALVA A FOTO.
         *
         * Se a foto não for salva,
         * a lubrificação não será concluída.
         */

        const photo =
            await uploadPhoto(
                photoData,
                point,
                performedAt
            );

        /*
         * Atualiza a última lubrificação
         * e a próxima data.
         */

        const updated =
            await sb(
                `/lubrication_points?id=eq.${encodeURIComponent(id)}`,
                {
                    method: 'PATCH',

                    body: JSON.stringify({
                        last_lubricated_at:
                            performedAt,

                        next_date:
                            nextDate
                    })
                }
            );

        /*
         * Salva histórico.
         */

        const history = {

            machine:
                point.machine,

            code:
                point.code,

            sector:
                point.sector,

            point:
                point.point,

            lubricant:
                point.lubricant,

            quantity:
                point.quantity,

            responsible_name:
                responsible ||
                point.responsible ||
                'Não informado',

            responsible_id:
                responsible_id ||
                point.responsible_id ||
                null,

            performed_at:
                performedAt,

            photo_path:
                photo.path,

            photo_uploaded_at:
                photo.uploaded_at
        };

        const saved =
            await sb(
                '/lubrication_history',
                {
                    method: 'POST',

                    body:
                        JSON.stringify(history)
                }
            );

        /*
         * E-mail.
         *
         * Se o e-mail der erro,
         * a lubrificação continua registrada.
         */

        let emailResult = null;
        let emailError = null;

        try {

            emailResult =
                await sendEmail({

                    machine:
                        point.machine ||
                        'Não informado',

                    code:
                        point.code ||
                        'Não informado',

                    sector:
                        point.sector ||
                        'Não informado',

                    point:
                        point.point ||
                        'Não informado',

                    lubricant:
                        point.lubricant ||
                        'Não informado',

                    quantity:
                        point.quantity ||
                        'Não informado',

                    responsible:
                        responsible ||
                        point.responsible ||
                        'Não informado',

                    performedAt:
                        new Date(
                            performedAt
                        ).toLocaleString(
                            'pt-BR',
                            {
                                timeZone:
                                    'America/Sao_Paulo'
                            }
                        ),

                    nextDate:
                        new Date(
                            `${nextDate}T12:00:00`
                        ).toLocaleDateString(
                            'pt-BR'
                        )
                });

        } catch (emailErr) {

            console.error(
                'Erro ao enviar e-mail:',
                emailErr
            );

            emailError =
                emailErr.message ||
                'Erro ao enviar e-mail.';
        }

        return res
            .status(200)
            .json({

                success:
                    true,

                point:
                    updated?.[0] ||
                    updated,

                history:
                    saved?.[0] ||
                    saved,

                next_date:
                    nextDate,

                photo_path:
                    photo.path,

                email_sent:
                    !!emailResult,

                email_error:
                    emailError
            });

    } catch (error) {

        console.error(
            'Erro na API de lubrificação:',
            error
        );

        return res
            .status(500)
            .json({
                error:
                    error.message ||
                    'Erro interno ao registrar lubrificação.'
            });
    }
}
