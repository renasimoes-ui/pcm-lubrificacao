export default async function handler(req, res) {
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({
                error: "Variáveis do Supabase não configuradas"
            });
        }

        const pin = req.query.pin;

        if (!pin) {
            return res.status(400).json({
                error: "PIN não informado"
            });
        }

        const url = `${supabaseUrl}/rest/v1/users?pin=eq.${encodeURIComponent(pin)}&select=id,name,function_name,role,active`;

        const response = await fetch(url, {
            headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(500).json({
                error: "Erro Supabase",
                details: data
            });
        }

        if (!data.length) {
            return res.status(401).json({
                error: "PIN inválido"
            });
        }

        return res.status(200).json({
            id: data[0].id,
            name: data[0].name,
            function: data[0].function_name,
            role: data[0].role,
            active: data[0].active
        });

    } catch (error) {
        return res.status(500).json({
            error: "Erro interno",
            details: error.message
        });
    }
}
