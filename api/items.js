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

function storageBase() {
    return process.env.SUPABASE_URL.replace(/\/$/, '') + '/storage/v1';
}

async function sb(path, opts = {}) {
    const response = await fetch(base() + path, {
        ...opts,
        headers: {
            ...headers(),
            ...(opts.headers || {})
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

/*
 * Cria uma URL temporária para
 * visualizar uma foto privada.
 */
async function signedPhotoUrl(path) {
    if (!path) return null;

    const encodedPath = path
        .split('/')
        .map(encodeURIComponent)
        .join('/');

    const response = await fetch(
        `${storageBase()}/object/sign/lubrication-photos/${encodedPath}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization':
                    'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
            },
            body: JSON.stringify({
                expiresIn: 3600
            })
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

    if (signed.startsWith('http')) {
        return signed;
    }

    return (
        process.env.SUPABASE_URL.replace(/\/$/, '') +
        '/storage/v1' +
        signed
    );
}

/*
 * Recebe uma imagem em data URL (base64),
 * enviada pelo HTML, e salva no Storage.
 */
async function uploadReferencePhoto(
    dataUrl,
    pointId,
    sector,
    code
) {
    if (!dataUrl) {
        return null;
    }

    const match = String(dataUrl).match(
        /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s
    );

    if (!match) {
        throw new Error(
            'A foto de referência está em formato inválido.'
        );
    }

    const contentType = match[1].toLowerCase();
    const base64 = match[2];

    const buffer = Buffer.from(
        base64,
        'base64'
    );

    /*
     * Limite de segurança para evitar
     * uploads acidentais muito grandes.
     */
    if (buffer.length > 4 * 1024 * 1024) {
        throw new Error(
            'A foto de referência é muito grande. Tire uma foto com tamanho menor.'
        );
    }

    const extensionMap = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
    };

    const extension =
        extensionMap[contentType] || 'jpg';

    const safeSector = String(
        sector || 'sem-setor'
    ).replace(
        /[^a-zA-Z0-9_-]/g,
        '_'
    );

    const safeCode = String(
        code || pointId || 'sem-codigo'
    ).replace(
        /[^a-zA-Z0-9_-]/g,
        '_'
    );

    const timestamp = Date.now();

    const path =
        `${safeSector}/${safeCode}/${timestamp}-${pointId || 'novo'}.${extension}`;

    const response = await fetch(
        `${storageBase()}/object/lubrication-photos/${path
            .split('/')
            .map(encodeURIComponent)
            .join('/')}`,
        {
            method: 'POST',

            headers: {
                'Content-Type': contentType,

                'apikey':
                    process.env.SUPABASE_SERVICE_ROLE_KEY,

                'Authorization':
                    'Bearer ' +
                    process.env.SUPABASE_SERVICE_ROLE_KEY,

                'x-upsert': 'true'
            },

            body: buffer
        }
    );

    const text = await response.text();

    if (!response.ok) {
        console.error(
            'Erro ao enviar foto de referência:',
            text
        );

        throw new Error(
            'Não foi possível salvar a foto de referência no Storage.'
        );
    }

    return path;
}

/*
 * Exclui uma foto antiga do Storage.
 */
async function deleteStoragePhoto(path) {
    if (!path) return;

    const response = await fetch(
        `${storageBase()}/object/lubrication-photos`,
        {
            method: 'DELETE',

            headers: {
                'Content-Type':
                    'application/json',

                'apikey':
                    process.env.SUPABASE_SERVICE_ROLE_KEY,

                'Authorization':
                    'Bearer ' +
                    process.env.SUPABASE_SERVICE_ROLE_KEY
            },

            body: JSON.stringify({
                prefixes: [path]
            })
        }
    );

    if (!response.ok) {
        console.warn(
            'Não foi possível excluir a foto antiga:',
            await response.text()
        );
    }
}

/*
 * Retorna o ponto com a URL temporária
 * da foto de referência.
 */
async function pointFromRow(point) {
    return {
        ...point,

        reference_photo_url:
            await signedPhotoUrl(
                point.reference_photo_path
            )
    };
}

/*
 * Retorna o histórico com a URL temporária
 * da foto da execução.
 */
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
        if (req.method === 'GET') {

            const [
                points,
                history
            ] = await Promise.all([

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
            const [
                pointsWithPhotos,
                historyWithPhotos
            ] = await Promise.all([

                Promise.all(
                    (points || [])
                        .map(pointFromRow)
                ),

                Promise.all(
                    (history || [])
                        .map(historyFromRow)
                )

            ]);

            return res
                .status(200)
                .json({

                    points:
                        pointsWithPhotos,

                    history:
                        historyWithPhotos

                });
        }

        /*
         * POST
         *
         * Cadastro de ponto.
         */
        if (req.method === 'POST') {

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
                {
                    ...(body.data || {})
                };

            /*
             * A foto vem como base64
             * e não deve ser enviada
             * para a tabela.
             */
            const photoData =
                point.reference_photo_data;

            delete point.reference_photo_data;

            /*
             * Primeiro cria o ponto
             * para obter o ID definitivo.
             */
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

            const created =
                rows?.[0] || rows;

            if (!created?.id) {

                throw new Error(
                    'Ponto criado, mas não foi possível obter o ID.'
                );
            }

            try {

                /*
                 * Salva a foto no Storage.
                 */
                const photoPath =
                    await uploadReferencePhoto(
                        photoData,
                        created.id,
                        created.sector ||
                            point.sector,
                        created.code ||
                            point.code
                    );

                if (photoPath) {

                    /*
                     * Salva o caminho da foto
                     * na tabela do ponto.
                     */
                    const updatedRows =
                        await sb(
                            `/lubrication_points?id=eq.${encodeURIComponent(created.id)}`,
                            {
                                method: 'PATCH',

                                body:
                                    JSON.stringify({

                                        reference_photo_path:
                                            photoPath,

                                        reference_photo_uploaded_at:
                                            new Date().toISOString()

                                    })
                            }
                        );

                    return res
                        .status(201)
                        .json({

                            point:
                                updatedRows?.[0] ||
                                {
                                    ...created,

                                    reference_photo_path:
                                        photoPath
                                }

                        });
                }

            } catch (photoError) {

                /*
                 * Se a foto falhar,
                 * remove o ponto recém-criado.
                 */
                await sb(
                    `/lubrication_points?id=eq.${encodeURIComponent(created.id)}`,
                    {
                        method:
                            'DELETE'
                    }
                ).catch(() => {});

                throw photoError;
            }

            return res
                .status(201)
                .json({
                    point:
                        created
                });
        }

        /*
         * PUT
         *
         * Editar ponto.
         */
        if (req.method === 'PUT') {

            const {
                id,
                data: incomingData
            } = req.body || {};

            if (!id) {

                return res
                    .status(400)
                    .json({
                        error:
                            'ID obrigatório.'
                    });
            }

            const incoming =
                {
                    ...(incomingData || {})
                };

            /*
             * Verifica se uma nova foto
             * foi enviada.
             */
            const photoData =
                incoming.reference_photo_data;

            delete incoming.reference_photo_data;

            /*
             * Busca o ponto atual.
             */
            const currentRows =
                await sb(
                    `/lubrication_points?id=eq.${encodeURIComponent(id)}&select=*`
                );

            if (!currentRows?.length) {

                return res
                    .status(404)
                    .json({
                        error:
                            'Ponto não encontrado.'
                    });
            }

            const current =
                currentRows[0];

            /*
             * Se foi enviada nova foto,
             * salva primeiro no Storage.
             */
            if (photoData) {

                const photoPath =
                    await uploadReferencePhoto(
                        photoData,
                        id,
                        incoming.sector ??
                            current.sector,
                        incoming.code ??
                            current.code
                    );

                incoming.reference_photo_path =
                    photoPath;

                incoming.reference_photo_uploaded_at =
                    new Date().toISOString();
            }

            /*
             * Atualiza o ponto.
             */
            const rows =
                await sb(
                    `/lubrication_points?id=eq.${encodeURIComponent(id)}`,
                    {
                        method:
                            'PATCH',

                        body:
                            JSON.stringify(
                                incoming
                            )
                    }
                );

            /*
             * Só remove a foto anterior
             * depois que a nova já foi salva.
             */
            if (
                photoData &&
                current.reference_photo_path &&
                incoming.reference_photo_path !==
                    current.reference_photo_path
            ) {

                await deleteStoragePhoto(
                    current.reference_photo_path
                );
            }

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
        if (req.method === 'DELETE') {

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

            /*
             * Descobre a foto vinculada
             * antes de excluir o ponto.
             */
            const currentRows =
                await sb(
                    `/lubrication_points?id=eq.${encodeURIComponent(id)}&select=reference_photo_path`
                );

            const oldPhotoPath =
                currentRows?.[0]
                    ?.reference_photo_path;

            /*
             * Exclui o ponto.
             */
            await sb(
                `/lubrication_points?id=eq.${encodeURIComponent(id)}`,
                {
                    method:
                        'DELETE'
                }
            );

            /*
             * Exclui também a foto.
             */
            if (oldPhotoPath) {

                await deleteStoragePhoto(
                    oldPhotoPath
                );
            }

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
