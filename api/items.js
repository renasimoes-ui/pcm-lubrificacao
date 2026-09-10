function headers() {
    return {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization':
            `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer':
            'return=representation'
    };
}

function base() {
    return (
        process.env.SUPABASE_URL
            .replace(/\/$/, '') +
        '/rest/v1'
    );
}

function storageBase() {
    return (
        process.env.SUPABASE_URL
            .replace(/\/$/, '') +
        '/storage/v1'
    );
}

async function sb(path, opts = {}) {

    const response =
        await fetch(
            base() + path,
            {
                ...opts,

                headers: {
                    ...headers(),
                    ...(opts.headers || {})
                }
            }
        );

    const text =
        await response.text();

    let data;

    try {
        data =
            text
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

/*
 * Cria uma URL temporária para
 * visualizar a foto privada.
 */

async function signedPhotoUrl(path) {

    if (!path) {
        return null;
    }

    const encodedPath =
        path
            .split('/')
            .map(
                encodeURIComponent
            )
            .join('/');

    const response =
        await fetch(
            `${storageBase()}/object/sign/lubrication-photos/${encodedPath}`,
            {
                method: 'POST',

                headers: {
                    'Content-Type':
                        'application/json',

                    'apikey':
                        process.env.SUPABASE_SERVICE_ROLE_KEY,

                    'Authorization':
                        'Bearer ' +
                        process.env.SUPABASE_SERVICE_ROLE_KEY
                },

                body:
                    JSON.stringify({
                        expiresIn:
                            3600
                    })
            }
        );

    const text =
        await response.text();

    let data;

    try {
        data =
            text
                ? JSON.parse(text)
                : null;
    } catch {
        data = text;
    }

    if (!response.ok) {

        console.error(
            'Erro ao gerar URL da foto:',
            data
        );

        return null;
    }

    const signed =
        data?.signedURL ||
        data?.signedUrl ||
        data?.signed_url;

    if (!signed) {
        return null;
    }

    /*
     * Algumas respostas do Supabase
     * já retornam URL completa.
     */

    if (
        signed.startsWith('http')
    ) {
        return signed;
    }

    return (
        process.env.SUPABASE_URL
            .replace(/\/$/, '') +
        '/storage/v1' +
        signed
    );
}

function pointFromRow(point) {
    return {
        ...point
    };
}

async function historyFromRow(history) {

    const photoUrl =
        await signedPhotoUrl(
            history.photo_path
        );

    return {

        ...history,

        photo_url:
            photoUrl
    };
}

export default async function handler(
    req,
    res
) {

    try {

        /*
         * GET
         *
         * Carrega pontos e histórico.
         */

        if (
            req.method === 'GET'
        ) {

            const [
                points,
                history
            ] =
                await Promise.all([

                    sb(
                        '/lubrication_points?select=*&order=code.asc'
                    ),

                    sb(
                        '/lubrication_history?select=*&order=performed_at.desc'
                    )

                ]);

            /*
             * Gera os links temporários
             * das fotos.
             */

            const historyWithPhotos =
                await Promise.all(
                    (history || [])
                        .map(
                            historyFromRow
                        )
                );

            return res
                .status(200)
                .json({

                    points:
                        (points || [])
                            .map(
                                pointFromRow
                            ),

                    history:
                        historyWithPhotos

                });
        }

        /*
         * POST
         *
         * Cadastro de ponto.
         */

        if (
            req.method === 'POST'
        ) {

            const body =
                req.body || {};

            if (
                body.type !== 'point'
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            'Tipo inválido.'
                    });
            }

            const point =
                body.data || {};

            const rows =
                await sb(
                    '/lubrication_points',
                    {
                        method: 'POST',

                        body:
                            JSON.stringify(
                                point
                            )
                    }
                );

            return res
                .status(201)
                .json({

                    point:
                        rows?.[0] ||
                        rows

                });
        }

        /*
         * PUT
         *
         * Editar ponto.
         */

        if (
            req.method === 'PUT'
        ) {

            const {
                id,
                data
            } =
                req.body || {};

            if (!id) {

                return res
                    .status(400)
                    .json({
                        error:
                            'ID obrigatório.'
                    });
            }

            const rows =
                await sb(
                    `/lubrication_points?id=eq.${encodeURIComponent(id)}`,
                    {
                        method:
                            'PATCH',

                        body:
                            JSON.stringify(
                                data || {}
                            )
                    }
                );

            return res
                .status(200)
                .json({

                    point:
                        rows?.[0] ||
                        rows

                });
        }

        /*
         * DELETE
         *
         * Excluir ponto.
         */

        if (
            req.method === 'DELETE'
        ) {

            const url =
                new URL(
                    req.url,
                    'http://localhost'
                );

            const id =
                url.searchParams
                    .get('id');

            if (!id) {

                return res
                    .status(400)
                    .json({
                        error:
                            'ID obrigatório.'
                    });
            }

            await sb(
                `/lubrication_points?id=eq.${encodeURIComponent(id)}`,
                {
                    method:
                        'DELETE'
                }
            );

            return res
                .status(200)
                .json({
                    ok:
                        true
                });
        }

        return res
            .status(405)
            .json({
                error:
                    'Método não permitido.'
            });

    } catch (error) {

        console.error(
            'Erro na API de itens:',
            error
        );

        return res
            .status(500)
            .json({
                error:
                    error.message ||
                    'Erro interno.'
            });
    }
}
