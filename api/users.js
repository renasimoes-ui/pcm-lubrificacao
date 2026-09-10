export default async function handler(req, res) {
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({
                error: "Variáveis do Supabase não configuradas"
            });
        }

        const pin = req.query?.pin;

        if (!pin) {
            return res.status(400).json({
                error: "PIN não informado"
            });
        }

        const url =
            `${supabaseUrl}/rest/v1/users` +
            `?pin=eq.${encodeURIComponent(pin)}` +
            `&select=id,name,function,role`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "apikey": supabaseKey,
                "Authorization": `Bearer ${supabaseKey}`,
                "Content-Type": "application/json"
            }
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Supabase:", data);

            return res.status(500).json({
                error: "Erro ao consultar Supabase",
                details: data
            });
        }

        if (!data || data.length === 0) {
            return res.status(401).json({
                error: "PIN inválido"
            });
        }

        return res.status(200).json(data[0]);

    } catch (error) {
        console.error("Erro:", error);

        return res.status(500).json({
            error: "Erro interno do servidor",
            details: error.message
        });
    }
}
