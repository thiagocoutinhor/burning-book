const Book = require('../book/book-model').Book
const books = {} // Controle para evitar dissincronia dos books entre sockets

module.exports = socket => {
    const usuario = socket.handshake.session.usuario
    const bookId = socket.handshake.query.id

    new Promise((resolve, reject) => {
        if (books[bookId]) {
            books[bookId].count++
            resolve(books[bookId].book)
        } else {
            Book.findById(bookId).then(book => {
                books[bookId] = {
                    book: book,
                    count: 1
                }
                resolve(book)
            }).catch(erro => {
                reject(erro)
            })
        }
    })
    .then(book => {
        if (!book) {
            console.warn(`[IO BOOK - ${usuario.login}] Tentativa de acesso a um book que não existe ${bookId}`)
            socket.emit('exit')
            socket.disconnect()
            returns
        }

        if (!temAcesso(book)) {
            console.warn(`[IO BOOK - ${usuario.login}] Tentativa de acesso indevida ao book ${bookId}`)
            socket.emit('exit')
            socket.disconnect()
            return
        }

        console.info(`[IO BOOK - ${usuario.login}] Conectou no book ${bookId}`)
        socket.emit('book', book.toJSON())
        socket.join(bookId)

        socket.on('name', title => {
            book.name = title
            book.save().then(book => {
                socket.emit('name', book.name)
                socket.broadcast.to(bookId).emit('name', book.name)
            }).catch(erro => {
                console.info(`[IO BOOK - ${usuario.login}] Erro ao renomear o book ${bookId}`, erro)
                socket.emit('name.error', erro)
            })
        })

        socket.on('new', () => {
            book.commands.push({ command: '' })
            book.save()

            socket.broadcast.to(bookId).emit('book', book.toJSON())
        })

        socket.on('remove', index => {
            book.commands.splice(index, 1)
            book.save()

            socket.broadcast.to(bookId).emit('book', book)
        })

        var saveDelay = null
        socket.on('update', (index, command) => {
            book.commands[index].command = command

            // Delay sem atividade para salvar
            if (saveDelay) {
                clearTimeout(saveDelay)
            }
            saveDelay = setTimeout(() => book.save(), 1 * 1000)

            socket.broadcast.to(bookId).emit('update', index, command)
        })

        socket.on('disconnect', () => {
            console.info(`[IO BOOK - ${usuario.login}] Desconectou`)
            books[bookId].count--
            if (books[bookId].count === 0) {
                books[bookId] = undefined
            }
        })
    })
    .catch(erro => {
        console.warn(`[IO BOOK - ${usuario.login}] Tentativa de acesso a um book que não existe ${bookId}`)
        socket.emit('exit')
        socket.disconnect()
    })

    // Funcoes auxiliares
    function temAcesso(book) {
        return book.owner.toLowerCase() === usuario.login.toLowerCase() ||
            book.sharedWith.map(usr => usr.toLowerCase()).includes(usuario.login.toLowerCase())
    }
}