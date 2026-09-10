function headers() {
    return {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization':
            'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Prefer': 'return=representation'
    };
}

function base() {
    return (
        process.env.SUPABASE_URL.replace(/\/$/, '') +
        '/rest/v1'
    );
}

async function sb(path, opts = {}) {

    const response = await fetch(
        base() + path,
        {
            ...opts,

            headers: {
                ...headers(),
                ...(opts.headers || {})
            }
        }
    );

    const text = await response.text();

    let data;

    try {
        data = text
            ? JSON.parse(text)
            : null;
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


/* =========================================================
   SOMAR DIAS
========================================================= */

function addDays(date, days) {

    const d = new Date(date);

    d.setDate(
        d.getDate() +
        Number(days || 0)
    );

    return d
        .toISOString()
        .slice(0, 10);
}


/* =========================================================
   API
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
           BUSCAR PONTO
        ===================================================== */

        const rows = await sb(
            `/lubrication_points?id=eq.${encodeURIComponent(id)}&select=*`
        );


        const pt = rows?.[0];


        if (!pt) {

            return res.status(404).json({
                error: 'Ponto de lubrificação não encontrado.'
            });

        }


        /* =====================================================
           DATA/HORA ATUAL
        ===================================================== */

        const performedAt =
            new Date().toISOString();


        /* =====================================================
           PRÓXIMA LUBRIFICAÇÃO
        ===================================================== */

        const nextDate =
            addDays(
                performedAt,
                pt.frequency_days
            );


        /* =====================================================
           ATUALIZAR PONTO
        ===================================================== */

        const updated = await sb(
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


        /* =====================================================
           HISTÓRICO
        ===================================================== */

        const history = {

            machine:
                pt.machine,

            code:
                pt.code,

            sector:
                pt.sector,

            point:
                pt.point,

            lubricant:
                pt.lubricant,

            quantity:
                pt.quantity,

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

                body:
                    JSON.stringify(history)
            }
        );


        /* =====================================================
           RETORNO
        ===================================================== */

        return res.status(200).json({

            success: true,

            point:
                updated?.[0] ||
                updated,

            history:
                saved?.[0] ||
                saved,

            next_date:
                nextDate

        });


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
