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
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if(!email || !password){
            return res.status(400).json({ error: 'Email та пароль є обов’язковими'});
        }

        const user = await prisma.user.findUnique({
            where: {email},
        });

        if(!user) {
            return res.status(401).json({ error: 'Неправильний email або пароль'});
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if(!isPasswordValid){
            return res.status(401).json({ error: 'Неправильний email або пароль'});
        }

        const token = jwt.sign({ userId: user.id}, JWT_SECRET, { expiresIn: '24h'});

        res.json({
            message: 'Вхід успішний',
            token,
            user: { id: user.id, email: user.email, name: user.name},
        });
    }
    catch (error) {
        console.error('Помилка входу:', error);
        res.status(500).json({ error: 'Помилка на сервері під час входу'});
    }
};

const getProfile = async (req, res) => {
    try{
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { id: true, email: true, name: true, createdAt: true },
        });

    if (!user) {
      return res.status(404).json({ error: 'Користувача не знайдено' });
    }
    res.json(user);
    } 
    catch (error) {
    console.error('Помилка отримання профілю:', error);
    res.status(500).json({ error: 'Помилка сервера' });  
    }
};

module.exports = {
  register,
  login,
  getProfile,
};