```javascript
function headers() {
    return {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation'
    };
}

function base() {
    return process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1';
}

async function sb(path, opts = {}) {
    const r = await fetch(base() + path, {
        ...opts,
        headers: {
            ...headers(),
            ...(opts.headers || {})
        }
    });

    const text = await r.text();

    let data;

    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }

    if (!r.ok) {
        throw new Error(
            typeof data === 'string'
                ? data
                : (
                    data?.message ||
                    data?.hint ||
                    data?.details ||
                    'Supabase error'
                )
        );
    }

    return data;
}

function addDays(date, days) {
    const d = new Date(date);

    d.setDate(
        d.getDate() + Number(days || 0)
    );

    return d.toISOString().slice(0, 10);
}


/* =========================================================
   ENVIO DE E-MAIL PELO RESEND
   ========================================================= */

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
                    'rena.simoes@abmaderias.com.br',
                    'ery.soares@abmadeiras.com.br',
                    'alcedir.rocha@abmadeiras.com.br'
                ],

                subject:
                    `Lubrificação realizada - ${data.code}`,

                html: `
                    <div style="
                        font-family: Arial, sans-serif;
                        max-width: 700px;
                        margin: 0 auto;
                        padding: 20px;
                    ">

                        <h2 style="margin-bottom: 5px;">
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

                        <p style="
                            color: #64748b;
                            font-size: 12px;
                        ">
                            E-mail automático enviado pelo sistema
                            PCM • Lubrificação.
                        </p>

                    </div>
                `
            })
        }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result?.message ||
            'Erro ao enviar e-mail pelo Resend.'
        );
    }

    return result;
}


/* =========================================================
   API PRINCIPAL
   ========================================================= */

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
            responsible_id = null
        } = req.body || {};

        if (!id) {
            return res.status(400).json({
                error: 'ID obrigatório.'
            });
        }

        /* =====================================================
           BUSCA O PONTO
           ===================================================== */

        const rows = await sb(
            `/lubrication_points?id=eq.${encodeURIComponent(id)}&select=*`
        );

        const pt = rows?.[0];

        if (!pt) {
            return res.status(404).json({
                error: 'Ponto não encontrado.'
            });
        }

        /* =====================================================
           DATA DA LUBRIFICAÇÃO
           ===================================================== */

        const performedAt =
            new Date().toISOString();

        /* =====================================================
           PRÓXIMA DATA
           ===================================================== */

        const nextDate =
            addDays(
                performedAt,
                pt.frequency_days
            );

        /* =====================================================
           ATUALIZA O PONTO
           ===================================================== */

        const updated = await sb(
            `/lubrication_points?id=eq.${encodeURIComponent(id)}`,
            {
                method: 'PATCH',

                body: JSON.stringify({
                    last_lubricated_at: performedAt,
                    next_date: nextDate
                })
            }
        );

        /* =====================================================
           REGISTRA NO HISTÓRICO
           ===================================================== */

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

            performed_at:
                performedAt
        };

        const saved = await sb(
            '/lubrication_history',
            {
                method: 'POST',

                body: JSON.stringify(history)
            }
        );


        /* =====================================================
           ENVIA O E-MAIL
           ===================================================== */

        let emailResult = null;
        let emailError = null;

        try {

            emailResult = await sendEmail({

                machine:
                    pt.machine || 'Não informado',

                code:
                    pt.code || 'Não informado',

                sector:
                    pt.sector || 'Não informado',

                point:
                    pt.point || 'Não informado',

                lubricant:
                    pt.lubricant || 'Não informado',

                quantity:
                    pt.quantity || 'Não informado',

                responsible:
                    responsible ||
                    pt.responsible ||
                    'Não informado',

                performedAt:
                    new Date(performedAt)
                        .toLocaleString(
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


        /* =====================================================
           RETORNO
           ===================================================== */

        return res.status(200).json({

            point:
                updated?.[0] ||
                updated,

            history:
                saved?.[0] ||
                saved,

            next_date:
                nextDate,

            email_sent:
                !!emailResult,

            email_error:
                emailError

        });

    } catch (e) {

        console.error(e);

        return res.status(500).json({

            error:
                e.message ||
                'Erro interno.'
        });
    }
}
```
