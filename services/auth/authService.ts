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

if (!isFirebaseConfigured || !app || !db) {
    throw new Error('Firebase não configurado. Verifique o .env.local com as 6 variáveis VITE_FIREBASE_*.');
}

const auth = getAuth(app);
const firestore = db;

export type AuthRole = 'admin' | 'colaborador' | 'pendente';

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

async function ensureFirstUserIsAdmin(uid: string, email: string, name: string): Promise<UserDoc> {
    // Se a coleção users estiver vazia, esse cadastro é o primeiro admin
    const all = await getDocs(collection(firestore,'users'));
    const isFirst = all.empty;
    const role: AuthRole = isFirst ? 'admin' : 'pendente';
    const docData: UserDoc = {
        uid, email, name, role,
        createdAt: serverTimestamp(),
        ...(isFirst ? { approvedAt: serverTimestamp(), approvedBy: 'self' } : {}),
    };
    await setDoc(doc(firestore,'users', uid), docData);
    return docData;
}

export function subscribeAuthState(cb: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
        if (!fbUser) { cb(null); return; }
        let userDoc = await fetchUserDoc(fbUser.uid);
        if (!userDoc) {
            userDoc = await ensureFirstUserIsAdmin(
                fbUser.uid,
                fbUser.email ?? '',
                fbUser.displayName ?? (fbUser.email ?? '').split('@')[0],
            );
        }
        cb({
            id: fbUser.uid,
            uid: fbUser.uid,
            email: fbUser.email ?? '',
            name: userDoc.name,
            role: userDoc.role,
        } as any);
    });
}

export async function signup(email: string, password: string, name: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await ensureFirstUserIsAdmin(cred.user.uid, email, name);
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
