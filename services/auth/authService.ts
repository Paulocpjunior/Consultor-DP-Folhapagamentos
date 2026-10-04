import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    type User as FirebaseUser,
} from 'firebase/auth';
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    collection,
    getDocs,
    updateDoc,
    query,
    orderBy,
} from 'firebase/firestore';
import app, { isFirebaseConfigured, db } from '../firebaseConfig';
import type { User } from '../../types';
import { ehMaster, papelEfetivo, type Papel } from './papeis';

if (!isFirebaseConfigured || !app || !db) {
    throw new Error('Firebase não configurado. Verifique o .env.local com as 6 variáveis VITE_FIREBASE_*.');
}

const auth = getAuth(app);
const firestore = db;

export type AuthRole = Papel;

export interface UserDoc {
    uid: string;
    email: string;
    name: string;
    role: AuthRole;
    createdAt?: any;
    approvedAt?: any;
    approvedBy?: string;
}

async function fetchUserDoc(uid: string): Promise<UserDoc | null> {
    const snap = await getDoc(doc(firestore,'users', uid));
    return snap.exists() ? (snap.data() as UserDoc) : null;
}

/**
 * Perfil novo nasce pendente; só o e-mail master verificado nasce gestor
 * (as regras do Firestore recusam qualquer outro papel na criação).
 */
async function criarPerfil(uid: string, email: string, name: string, masterVerificado: boolean): Promise<UserDoc> {
    const role: AuthRole = masterVerificado ? 'gestor' : 'pendente';
    const docData: UserDoc = {
        uid, email, name, role,
        createdAt: serverTimestamp(),
        ...(masterVerificado ? { approvedAt: serverTimestamp(), approvedBy: 'master' } : {}),
    };
    await setDoc(doc(firestore,'users', uid), docData);
    return docData;
}

export function subscribeAuthState(cb: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
        if (!fbUser) { cb(null); return; }
        const masterVerificado = ehMaster(fbUser.email) && fbUser.emailVerified;
        let userDoc = await fetchUserDoc(fbUser.uid);
        if (!userDoc) {
            userDoc = await criarPerfil(
                fbUser.uid,
                fbUser.email ?? '',
                fbUser.displayName ?? (fbUser.email ?? '').split('@')[0],
                masterVerificado,
            );
        } else if (masterVerificado && userDoc.role !== 'gestor') {
            // O master é sempre gestor (destrava o primeiro gestor do app).
            try { await updateDoc(doc(firestore, 'users', fbUser.uid), { role: 'gestor' }); userDoc = { ...userDoc, role: 'gestor' }; }
            catch (e) { console.warn('Não foi possível gravar o papel de gestor do master:', e); }
        }
        cb({
            id: fbUser.uid,
            uid: fbUser.uid,
            email: fbUser.email ?? '',
            name: userDoc.name,
            role: papelEfetivo(userDoc.role),
        } as any);
    });
}

export async function signup(email: string, password: string, name: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await criarPerfil(cred.user.uid, email, name, false);
}

export async function login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(auth, email, password);
}

export async function logout(): Promise<void> {
    await signOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
}

// ─── Admin: gerencia usuários ───────────────────────────────────────

export async function listUsers(): Promise<UserDoc[]> {
    const q = query(collection(firestore,'users'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as UserDoc);
}

export async function approveUser(uid: string, approvedBy: string, role: AuthRole = 'colaborador'): Promise<void> {
    await updateDoc(doc(firestore,'users', uid), {
        role,
        approvedAt: serverTimestamp(),
        approvedBy,
    });
}

export async function setRole(uid: string, role: AuthRole): Promise<void> {
    await updateDoc(doc(firestore,'users', uid), { role });
}
