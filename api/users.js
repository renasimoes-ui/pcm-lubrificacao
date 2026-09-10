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


/* =========================================================
   API DE USUÁRIOS
========================================================= */

export default async function handler(req, res) {

    try {

        /* =====================================================
           GET
           - Com PIN = LOGIN
           - Sem PIN = LISTA DE FUNCIONÁRIOS
        ===================================================== */

        if (req.method === 'GET') {

            const pin = req.query.pin;


            /* =================================================
               LOGIN POR PIN
            ================================================= */

            if (pin) {

                const users = await sb(
                    `/users?pin=eq.${encodeURIComponent(pin)}&active=eq.true&select=id,name,function_name,role,active`
                );


                if (!users || !users.length) {

                    return res.status(401).json({
                        error: 'PIN inválido.'
                    });

                }


                const user = users[0];


                return res.status(200).json({

                    id:
                        user.id,

                    name:
                        user.name,

                    function:
                        user.function_name,

                    role:
                        user.role,

                    active:
                        user.active

                });

            }


            /* =================================================
               LISTAR TODOS OS FUNCIONÁRIOS
            ================================================= */

            const users = await sb(
                '/users?select=id,name,function_name,role,pin,active,created_at&order=name.asc'
            );


            return res.status(200).json({
                users
            });

        }


        /* =====================================================
           POST
           CADASTRAR FUNCIONÁRIO
        ===================================================== */

        if (req.method === 'POST') {

            const body = req.body || {};

            const name =
                String(body.name || '').trim();

            const functionName =
                String(
                    body.function_name ||
                    body.function ||
                    ''
                ).trim();

            const pin =
                String(body.pin || '').trim();

            const role =
                body.role || 'maintenance';

            const active =
                body.active !== false;


            /* =================================================
               VALIDAÇÕES
            ================================================= */

            if (!name) {

                return res.status(400).json({
                    error: 'Nome do funcionário é obrigatório.'
                });

            }


            if (!functionName) {

                return res.status(400).json({
                    error: 'Função do funcionário é obrigatória.'
                });

            }


            if (!/^\d{4}$/.test(pin)) {

                return res.status(400).json({
                    error: 'O PIN deve ter exatamente 4 números.'
                });

            }


            /* =================================================
               VERIFICAR SE PIN JÁ EXISTE
            ================================================= */

            const existing = await sb(
                `/users?pin=eq.${encodeURIComponent(pin)}&select=id`
            );


            if (existing && existing.length) {

                return res.status(409).json({
                    error: 'Este PIN já está sendo utilizado.'
                });

            }


            /* =================================================
               CRIAR USUÁRIO
            ================================================= */

            const user = {

                name,

                function_name:
                    functionName,

                role,

                pin,

                active

            };


            const created = await sb(
                '/users',
                {
                    method: 'POST',
                    body:
                        JSON.stringify(user)
                }
            );


            return res.status(201).json({

                success: true,

                user:
                    created?.[0] ||
                    created

            });

        }


        /* =====================================================
           PUT
           EDITAR / ATIVAR / DESATIVAR FUNCIONÁRIO
        ===================================================== */

        if (req.method === 'PUT') {

            const body =
                req.body || {};

            const id =
                body.id;

            if (!id) {

                return res.status(400).json({
                    error: 'ID do funcionário é obrigatório.'
                });

            }


            const data =
                body.data || {};


            const update = {};


            /* =================================================
               NOME
            ================================================= */

            if (
                data.name !== undefined
            ) {

                const name =
                    String(
                        data.name
                    ).trim();


                if (!name) {

                    return res.status(400).json({
                        error: 'Nome inválido.'
                    });

                }


                update.name =
                    name;

            }


            /* =================================================
               FUNÇÃO
            ================================================= */

            if (
                data.function_name !== undefined
            ) {

                const functionName =
                    String(
                        data.function_name
                    ).trim();


                if (!functionName) {

                    return res.status(400).json({
                        error: 'Função inválida.'
                    });

                }


                update.function_name =
                    functionName;

            }


            /* =================================================
               PIN
            ================================================= */

            if (
                data.pin !== undefined
            ) {

                const pin =
                    String(
                        data.pin
                    ).trim();


                if (!/^\d{4}$/.test(pin)) {

                    return res.status(400).json({
                        error:
                            'O PIN deve ter exatamente 4 números.'
                    });

                }


                const existing =
                    await sb(
                        `/users?pin=eq.${encodeURIComponent(pin)}&id=neq.${encodeURIComponent(id)}&select=id`
                    );


                if (
                    existing &&
                    existing.length
                ) {

                    return res.status(409).json({
                        error:
                            'Este PIN já está sendo utilizado.'
                    });

                }


                update.pin =
                    pin;

            }


            /* =================================================
               CARGO
            ================================================= */

            if (
                data.role !== undefined
            ) {

                update.role =
                    data.role;

            }


            /* =================================================
               STATUS
            ================================================= */

            if (
                data.active !== undefined
            ) {

                update.active =
                    Boolean(
                        data.active
                    );

            }


            /* =================================================
               NADA PARA ATUALIZAR
            ================================================= */

            if (
                !Object.keys(update).length
            ) {

                return res.status(400).json({
                    error:
                        'Nenhuma informação foi enviada para atualização.'
                });

            }


            /* =================================================
               ATUALIZAR
            ================================================= */

            const updated =
                await sb(
                    `/users?id=eq.${encodeURIComponent(id)}`,
                    {
                        method: 'PATCH',

                        body:
                            JSON.stringify(update)
                    }
                );


            return res.status(200).json({

                success: true,

                user:
                    updated?.[0] ||
                    updated

            });

        }


        /* =====================================================
           DELETE
           NÃO APAGA FISICAMENTE.
           DESATIVA O FUNCIONÁRIO.
        ===================================================== */

        if (req.method === 'DELETE') {

            const id =
                new URL(
                    req.url,
                    'http://localhost'
                )
                    .searchParams
                    .get('id');


            if (!id) {

                return res.status(400).json({
                    error:
                        'ID do funcionário é obrigatório.'
                });

            }


            const updated =
                await sb(
                    `/users?id=eq.${encodeURIComponent(id)}`,
                    {
                        method: 'PATCH',

                        body:
                            JSON.stringify({
                                active: false
                            })
                    }
                );


            return res.status(200).json({

                success: true,

                message:
                    'Funcionário desativado.',

                user:
                    updated?.[0] ||
                    updated

            });

        }


        /* =====================================================
           MÉTODO NÃO PERMITIDO
        ===================================================== */

        return res.status(405).json({
            error:
                'Método não permitido.'
        });


    } catch (error) {

        console.error(
            'Erro na API de usuários:',
            error
        );


        return res.status(500).json({

            error:
                error.message ||
                'Erro interno na API de usuários.'

        });

    }

}
