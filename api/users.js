function base() {
    return process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1';
}

function headers() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    return {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Prefer': 'return=representation'
    };
}

async function sb(path, options = {}) {
    const response = await fetch(base() + path, {
        ...options,
        headers: {
            ...headers(),
            ...(options.headers || {})
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


// =====================================================
// VALIDAÇÃO DOS DADOS DO FUNCIONÁRIO
// =====================================================

function validateUser(data, requirePin = false) {

    const name = String(data?.name || '').trim();

    const functionName = String(
        data?.function_name || ''
    ).trim();

    const role =
        data?.role === 'admin'
            ? 'admin'
            : 'maintenance';

    if (!name) {
        throw new Error('Nome é obrigatório.');
    }

    if (!functionName) {
        throw new Error('Função é obrigatória.');
    }

    const result = {
        name,
        function_name: functionName,
        role,
        active: data?.active !== false
    };

    // =================================================
    // PIN
    // =================================================

    const rawPin = data?.pin;

    if (
        requirePin ||
        (
            rawPin !== undefined &&
            rawPin !== null &&
            String(rawPin).trim() !== ''
        )
    ) {

        const pin = String(rawPin || '').trim();

        if (!/^\d{4}$/.test(pin)) {
            throw new Error(
                'O PIN deve ter exatamente 4 números.'
            );
        }

        result.pin = pin;
    }

    return result;
}


// =====================================================
// API
// =====================================================

export default async function handler(req, res) {

    try {

        // =================================================
        // VERIFICAÇÃO DAS VARIÁVEIS
        // =================================================

        if (
            !process.env.SUPABASE_URL ||
            !process.env.SUPABASE_SERVICE_ROLE_KEY
        ) {

            return res.status(500).json({
                error:
                    'Variáveis do Supabase não configuradas.'
            });
        }


        // =================================================
        // GET
        // =================================================

        if (req.method === 'GET') {

            const pin = req.query?.pin;


            // =============================================
            // LOGIN POR PIN
            // =============================================

            if (pin) {

                const rows = await sb(
                    `/users?pin=eq.${encodeURIComponent(pin)}&active=eq.true&select=id,name,function_name,role,active`
                );

                if (!rows?.length) {

                    return res.status(401).json({
                        error: 'PIN inválido.'
                    });

                }

                const user = rows[0];

                return res.status(200).json({

                    id: user.id,

                    name: user.name,

                    function: user.function_name,

                    role: user.role,

                    active: user.active

                });
            }


            // =============================================
            // LISTAR FUNCIONÁRIOS
            // =============================================

            const rows = await sb(
                '/users?select=id,name,function_name,role,active,created_at&order=name.asc'
            );

            return res.status(200).json({

                users: rows || []

            });

        }


        // =================================================
        // POST
        // CRIAR FUNCIONÁRIO
        // =================================================

        if (req.method === 'POST') {

            const data = validateUser(
                req.body || {},
                true
            );

            const rows = await sb(
                '/users',
                {
                    method: 'POST',
                    body: JSON.stringify(data)
                }
            );

            return res.status(201).json({

                user: rows?.[0] || rows

            });

        }


        // =================================================
        // PUT
        // EDITAR FUNCIONÁRIO
        // =================================================

        if (req.method === 'PUT') {

            const id = req.body?.id;

            const incoming =
                req.body?.data || {};


            if (!id) {

                return res.status(400).json({

                    error:
                        'ID do usuário é obrigatório.'

                });

            }


            // =============================================
            // BUSCA FUNCIONÁRIO ATUAL
            // =============================================

            const currentRows = await sb(
                `/users?id=eq.${encodeURIComponent(id)}&select=*`
            );


            if (!currentRows?.length) {

                return res.status(404).json({

                    error:
                        'Usuário não encontrado.'

                });

            }


            const current = currentRows[0];


            // =============================================
            // JUNTA DADOS NOVOS + DADOS ATUAIS
            // =============================================

            const merged = {

                name:
                    incoming.name ??
                    current.name,

                function_name:
                    incoming.function_name ??
                    current.function_name,

                role:
                    incoming.role ??
                    current.role,

                pin:
                    incoming.pin ??
                    current.pin,

                active:
                    incoming.active ??
                    current.active

            };


            const data = validateUser(
                merged,
                true
            );


            // =============================================
            // ATUALIZA
            // =============================================

            const rows = await sb(
                `/users?id=eq.${encodeURIComponent(id)}`,
                {
                    method: 'PATCH',
                    body: JSON.stringify(data)
                }
            );


            return res.status(200).json({

                user:
                    rows?.[0] ||
                    rows

            });

        }


        // =================================================
        // MÉTODO NÃO PERMITIDO
        // =================================================

        return res.status(405).json({

            error:
                'Método não permitido.'

        });


    } catch (error) {

        console.error(
            'Erro na API de usuários:',
            error
        );

        const message =
            error?.message ||
            'Erro interno.';


        // =============================================
        // PIN DUPLICADO
        // =============================================

        if (
            message
                .toLowerCase()
                .includes('duplicate') ||

            message
                .toLowerCase()
                .includes('unique')
        ) {

            return res.status(409).json({

                error:
                    'Este PIN já está cadastrado. Escolha outro PIN.'

            });

        }


        return res.status(500).json({

            error: message

        });

    }

}
