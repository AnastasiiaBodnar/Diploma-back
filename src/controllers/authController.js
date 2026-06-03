import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../config/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export const register = async (req, res) => {
    try {
        const {email, password, firstName, lastName} = req.body;
        
        if(!email || !password) {
            return res.status(400).json({error: 'Email та пароль є обов’язковими'});
        }

        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return res.status(400).json({ error: 'Користувач з таким email вже існує' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                firstName,
                lastName,
            }
        });

        const token = jwt.sign({ userId: user.id}, JWT_SECRET, {expiresIn: '24h'});

        res.status(201).json({
            message: 'Користувач успішно зареєстрований',
            token,
            user: {id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName}
        });

    }

    catch (error) {
        console.error('Помилка реєстрації:', error);
        res.status(500).json({ error: 'Помилка на сервері під час реєстрації'});
    }
};

export const login = async (req, res) => {
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
            user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName }
        });
    }
    catch (error) {
        console.error('Помилка входу:', error);
        res.status(500).json({ error: 'Помилка на сервері під час входу'});
    }
};

export const getProfile = async (req, res) => {
    try{
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { id: true, email: true, firstName: true, lastName: true, createdAt: true },
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

export const googleLogin = async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Google ID Token є обов’язковим' });
        }

        // Верифікація токену від Google
        const ticket = await oauthClient.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { email, given_name, family_name } = payload;

        if (!email) {
            return res.status(400).json({ error: 'Не вдалося отримати email з Google акаунта' });
        }

        // Перевіряємо, чи існує користувач
        let user = await prisma.user.findUnique({
            where: { email },
        });

        // Якщо немає, реєструємо нового користувача
        if (!user) {
            user = await prisma.user.create({
                data: {
                    email,
                    firstName: given_name || null,
                    lastName: family_name || null,
                },
            });
        }

        const sessionToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

        res.json({
            message: 'Вхід через Google успішний',
            token: sessionToken,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
            },
        });
    } catch (error) {
        console.error('Помилка Google OAuth:', error);
        res.status(400).json({ error: 'Недійсний Google ID Token або помилка авторизації' });
    }
};