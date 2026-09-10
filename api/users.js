export default async function handler(req, res) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({
            error: 'Variáveis do Supabase não configuradas'
        });
    }

    if (req.method !== 'GET') {
        return res.status(405).json({
            error: 'Método não permitido'
        });
    }

    try {
        const pin = req.query.pin;

        if (!pin) {
            return res.status(400).json({
                error: 'PIN não informado'
            });
        }

        const response = await fetch(
            `${supabaseUrl}/rest/v1/users?pin=eq.${encodeURIComponent(pin)}&select=id,name,function,role,pin`,
            {
                headers: {
                    apikey: supabaseKey,
                    Authorization: `Bearer ${supabaseKey}`
                }
            }
        );

        if (!response.ok) {
            throw new Error('Erro ao consultar usuários');
        }

        const users = await response.json();

        if (!users.length) {
            return res.status(401).json({
                error: 'PIN inválido'
            });
        }

        return res.status(200).json(users[0]);

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: 'Erro interno do servidor'
        });
    }
}
