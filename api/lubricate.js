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

        const rows = await sb(
            `/lubrication_points?id=eq.${encodeURIComponent(id)}&select=*`
        );

        const pt = rows?.[0];

        if (!pt) {
            return res.status(404).json({
                error: 'Ponto não encontrado.'
            });
        }

        const performedAt =
            new Date().toISOString();

        const nextDate =
            addDays(
                performedAt,
                pt.frequency_days
            );

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

        return res.status(200).json({

            point:
                updated?.[0] ||
                updated,

            history:
                saved?.[0] ||
                saved,

            next_date:
                nextDate
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
