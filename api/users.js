```javascript
export default async function handler(req, res) {
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({
                error: "Variáveis do Supabase não configuradas"
            });
        }

        if (req.method !== "GET") {
            return res.status(405).json({
                error: "Método não permitido"
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
            `&active=eq.true` +
            `&select=id,name,function_name,role,active`;

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
            console.error("Erro Supabase:", data);

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

        const user = data[0];

        return res.status(200).json({
            id: user.id,
            name: user.name,
            function: user.function_name,
            role: user.role,
            active: user.active
        });

    } catch (error) {
        console.error("Erro interno:", error);

        return res.status(500).json({
            error: "Erro interno do servidor",
            details: error.message
        });
    }
}
```
