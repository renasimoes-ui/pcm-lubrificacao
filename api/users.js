```javascript
export default async function handler(req, res) {
    try {
        // Verifica as variáveis do Supabase
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({
                error: "Variáveis do Supabase não configuradas"
            });
        }

        // Aceita somente GET
        if (req.method !== "GET") {
            return res.status(405).json({
                error: "Método não permitido"
            });
        }

        // Pega o PIN enviado pela tela de login
        const pin = req.query?.pin;

        if (!pin) {
            return res.status(400).json({
                error: "PIN não informado"
            });
        }

        // Consulta o usuário pelo PIN
        // select=* evita o problema com o nome da coluna FUNCTION
        const url =
            `${supabaseUrl}/rest/v1/users` +
            `?pin=eq.${encodeURIComponent(pin)}` +
            `&select=*`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "apikey": supabaseKey,
                "Authorization": `Bearer ${supabaseKey}`,
                "Content-Type": "application/json"
            }
        });

        const data = await response.json();

        // Erro retornado pelo Supabase
        if (!response.ok) {
            console.error("Erro Supabase:", data);

            return res.status(500).json({
                error: "Erro ao consultar Supabase",
                details: data
            });
        }

        // PIN não encontrado
        if (!data || data.length === 0) {
            return res.status(401).json({
                error: "PIN inválido"
            });
        }

        // Usuário encontrado
        const user = data[0];

        return res.status(200).json({
            id: user.ID ?? user.id,
            name: user.NAME ?? user.name,
            function: user.FUNCTION ?? user.function,
            role: user.ROLE ?? user.role
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
