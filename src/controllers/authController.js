const bcrypt = require('bcryptjs');
const jwt = require ('jsonwebtoken');
const prisma =require('../config/prisma');

const JWT_SECRET = process.env.JWT_SECRET;

const register = async (req, res) => {
    try {
        const {email, password, name} = req.body;
        
        if(!email || !password) {
            return res.status(400).json({error: 'Email та пароль є обов’язковими'});
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
            }
        });

        const token = jwt.sign({ userId: user.id}, JWT_SECRET, {expiresIn: '24h'});

        res.status(201).json({
            message: 'Користувач успішно зареєстрований',
            token,
            user: {id: user.id, email: user.email, name: user.name},
        });

    }

    catch (error) {
        console.log ('');
        res.status(500).json({ error: 'Помилка на сервері під час реєстрації'});
    }
}

module.exports = {
  register
};