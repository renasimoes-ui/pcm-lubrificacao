async function handleLubricate(id) {

    const pt = points.find(
        p => String(p.id) === String(id)
    );

    if (!pt) {
        showToast(
            'Erro',
            'Ponto de lubrificação não encontrado.'
        );
        return;
    }

    if (!userCanSeePoint(pt)) {

        showToast(
            'Acesso negado',
            'Este ponto não está atribuído ao usuário logado.'
        );

        return;
    }

    if (!confirm(
        `Confirmar lubrificação da máquina ${pt.machine} (${pt.code})?`
    )) {
        return;
    }

    const responsibleUser =
        currentUser
            ? currentUser.name
            : (
                pt.responsible ||
                'Administrador'
            );

    try {

        const response = await fetch(
            '/api/lubricate',
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({
                    id: pt.id,

                    responsible:
                        responsibleUser,

                    responsible_id:
                        currentUser
                            ? currentUser.id
                            : null
                })
            }
        );


        /* =====================================================
           LEITURA SEGURA DA RESPOSTA DO SERVIDOR
           ===================================================== */

        const responseText =
            await response.text();

        let result = null;

        try {

            result =
                responseText
                    ? JSON.parse(responseText)
                    : null;

        } catch (jsonError) {

            console.error(
                'Resposta não-JSON do servidor:',
                responseText
            );

            throw new Error(
                responseText ||
                'O servidor retornou uma resposta inválida.'
            );
        }


        /* =====================================================
           VERIFICA SE A API RETORNOU ERRO
           ===================================================== */

        if (!response.ok) {

            throw new Error(
                result?.error ||
                result?.message ||
                result?.details ||
                'Erro ao registrar a lubrificação.'
            );

        }


        /* =====================================================
           ATUALIZA OS DADOS DO APP
           ===================================================== */

        await loadData();


        /* =====================================================
           MENSAGEM DE SUCESSO
           ===================================================== */

        if (result?.email_sent) {

            showToast(
                '✅ Lubrificação registrada!',
                `Lubrificação de ${pt.code} registrada por ${responsibleUser}. E-mail enviado com sucesso.`
            );

        } else {

            showToast(
                '✅ Lubrificação registrada!',
                `Lubrificação de ${pt.code} registrada por ${responsibleUser}.`
            );

            if (result?.email_error) {

                console.error(
                    'E-mail não enviado:',
                    result.email_error
                );

                setTimeout(() => {

                    showToast(
                        '⚠️ E-mail não enviado',
                        result.email_error
                    );

                }, 1200);

            }

        }


    } catch (error) {

        console.error(
            'Erro ao registrar lubrificação:',
            error
        );

        showToast(
            '❌ Erro',
            error.message ||
            'Não foi possível registrar a lubrificação.'
        );

    }

}
