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

async function uploadPhoto(dataUrl, pt, performedAt) {
    if (
        typeof dataUrl !== 'string' ||
        !dataUrl.startsWith('data:image/')
    ) {
        throw new Error('A foto da lubrificação é obrigatória.');
    }

    const match = dataUrl.match(
        /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i
    );

    if (!match) {
        throw new Error('Formato de foto não suportado.');
    }

    const mime =
        match[1].toLowerCase() === 'image/jpg'
            ? 'image/jpeg'
            : match[1].toLowerCase();

    const buffer = Buffer.from(match[2], 'base64');

    if (!buffer.length) {
        throw new Error('A foto está vazia.');
    }

    if (buffer.length > 4 * 1024 * 1024) {
        throw new Error(
            'A foto ficou muito grande. Tente tirar outra foto.'
        );
    }

    const path = [
        safePart(pt.sector),
        safePart(pt.code),
        `${Date.now()}-${safePart(pt.id)}.jpg`
    ].join('/');

    const response = await fetch(
        `${storageBase()}/object/lubrication-photos/${path
            .split('/')
            .map(encodeURIComponent)
            .join('/')}`,
        {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization':
                    'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
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
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        throw new Error(
            'RESEND_API_KEY não configurada no Vercel.'
        );
    }

    const response = await fetch(
        'https://api.resend.com/emails',
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
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
                    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px">

                        <h2>PCM • Lubrificação</h2>

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
                            <strong>Ponto de lubrificação:</strong>
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
                            <strong>Próxima lubrificação:</strong>
                            ${data.nextDate}
                        </p>

                        <hr>

                        <p style="color:#64748b;font-size:12px">
                            E-mail automático enviado pelo sistema
                            PCM • Lubrificação.
                        </p>

                    </div>
                `
            })
        }
    );

    const text = await response.text();

    let result;

    try {
        result = text ? JSON.parse(text) : {};
    } catch {
        result = { message: text };
    }

    if (!response.ok) {
        throw new Error(
            result?.message ||
            result?.error ||
            text ||
            'Erro ao enviar e-mail pelo Resend.'
        );
    }

    return result;
}

export default async function handler(req, res) {

    try {

        if (req.method !== 'POST') {
            return res.status(405).json({
                error: 'Método não permitido.'
            });
        }

        const {
            id,
            responsible,
            responsible_id = null,
            photoData = null
        } = req.body || {};

        if (!id) {
            return res.status(400).json({
                error: 'ID obrigatório.'
            });
        }

        if (!photoData) {
            return res.status(400).json({
                error:
                    'Tire a foto da lubrificação antes de concluir.'
            });
        }

        /*
         * Busca o ponto.
         */
        const rows = await sb(
            `/lubrication_points?id=eq.${encodeURIComponent(id)}&select=*`
        );

        const pt = rows?.[0];

        if (!pt) {
            return res.status(404).json({
                error: 'Ponto não encontrado.'
            });
        }

        /*
         * PROTEÇÃO CONTRA DUPLICIDADE
         *
         * O ponto precisa estar liberado para receber uma nova
         * lubrificação.
         *
         * A alteração abaixo é feita diretamente no banco com:
         *
         * completion_locked = false
         *
         * Somente UMA requisição consegue alterar false -> true.
         *
         * Se o funcionário clicar várias vezes rapidamente,
         * as próximas requisições não conseguem reservar o ponto
         * e são encerradas antes de criar histórico.
         */

        const performedAt = new Date().toISOString();

        const claimRows = await sb(
            `/lubrication_points?id=eq.${encodeURIComponent(id)}&completion_locked=eq.false`,
            {
                method: 'PATCH',
                body: JSON.stringify({
                    completion_locked: true
                })
            }
        );

        /*
         * Se não retornou nenhuma linha, outra requisição já
         * processou esse ponto.
         */
        if (!claimRows?.length) {
            return res.status(409).json({
                error:
                    'Este ponto já foi concluído ou está sendo processado.'
            });
        }

        const nextDate = addDays(
            performedAt,
            pt.frequency_days
        );

        try {

            /*
             * 1. Salva a foto.
             */
            const photo = await uploadPhoto(
                photoData,
                pt,
                performedAt
            );

            /*
             * 2. Atualiza o ponto.
             */
            const updated = await sb(
                `/lubrication_points?id=eq.${encodeURIComponent(id)}`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({
                        last_lubricated_at: performedAt,
                        next_date: nextDate,
                        completion_locked: true
                    })
                }
            );

            /*
             * 3. Cria UMA única entrada no histórico.
             */
            const history = {
                machine: pt.machine,
                code: pt.code,
                sector: pt.sector,
                point: pt.point,
                lubricant: pt.lubricant,
                quantity: pt.quantity,

                responsible_name:
                    responsible ||
                    pt.responsible ||
                    'Não informado',

                responsible_id:
                    responsible_id ||
                    pt.responsible_id ||
                    null,

                performed_at: performedAt,

                photo_path: photo.path,

                photo_uploaded_at:
                    photo.uploaded_at
            };

            const saved = await sb(
                '/lubrication_history',
                {
                    method: 'POST',
                    body: JSON.stringify(history)
                }
            );

            /*
             * 4. Envia o e-mail.
             *
             * Se o e-mail falhar, a lubrificação continua
             * registrada normalmente.
             */
            let emailResult = null;
            let emailError = null;

            try {

                emailResult = await sendEmail({

                    machine:
                        pt.machine ||
                        'Não informado',

                    code:
                        pt.code ||
                        'Não informado',

                    sector:
                        pt.sector ||
                        'Não informado',

                    point:
                        pt.point ||
                        'Não informado',

                    lubricant:
                        pt.lubricant ||
                        'Não informado',

                    quantity:
                        pt.quantity ||
                        'Não informado',

                    responsible:
                        responsible ||
                        pt.responsible ||
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

            /*
             * Resposta final.
             */
            return res.status(200).json({

                success: true,

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

        } catch (processingError) {

            /*
             * Se alguma etapa falhar antes da conclusão,
             * libera o ponto novamente.
             */
            try {

                await sb(
                    `/lubrication_points?id=eq.${encodeURIComponent(id)}`,
                    {
                        method: 'PATCH',
                        body: JSON.stringify({
                            completion_locked: false
                        })
                    }
                );

            } catch (unlockError) {

                console.error(
                    'Erro ao liberar ponto após falha:',
                    unlockError
                );
            }

            throw processingError;
        }

    } catch (error) {

        console.error(
            'Erro na API de lubrificação:',
            error
        );

        return res.status(500).json({
            error:
                error.message ||
                'Erro interno ao registrar lubrificação.'
        });
    }
}
