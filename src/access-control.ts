// ============================================================
// ACCESS CONTROL — Role-based filtering
// ============================================================

import { db } from './firebase';
import type { DocumentData, QuerySnapshot, DocumentSnapshot } from 'firebase/firestore';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';

type UserType = 'ADMIN' | 'SUPERVISOR' | 'AGENTE' | 'CLIENTE';

interface AccessState {
    userType: UserType;
    clienteAsignado: string | null;
    unidadesAsignadas: string[];
    macrozona?: string;
    zona?: string;
}

let _state: AccessState | null = null;

export const accessControl = {
    state: null as AccessState | null,

    async init(user: any): Promise<AccessState> {
        try {
            const email = user.email || '';
            const username = email ? email.split('@')[0].toLowerCase() : '';

            let snap: DocumentSnapshot<DocumentData> | null = null;
            let data: DocumentData | undefined;

            if (username) {
                // Try by username
                let s = await getDoc(doc(db, 'USUARIOS', username));
                if (!s.exists()) {
                    // Try trimmed
                    s = await getDoc(doc(db, 'USUARIOS', username.trim()));
                }
                if (s.exists()) snap = s;
            }

            // Try by email as doc ID
            if (!snap && email) {
                const s = await getDoc(doc(db, 'USUARIOS', email));
                if (s.exists()) snap = s;
            }

            // Try where 'CORREO' == email
            if (!snap && email) {
                const q1 = query(collection(db, 'USUARIOS'), where('CORREO', '==', email), limit(1));
                const qs1: QuerySnapshot<DocumentData> = await getDocs(q1);
                if (!qs1.empty) snap = qs1.docs[0];
            }

            // Try where 'email' == email
            if (!snap && email) {
                const q2 = query(collection(db, 'USUARIOS'), where('email', '==', email), limit(1));
                const qs2: QuerySnapshot<DocumentData> = await getDocs(q2);
                if (!qs2.empty) snap = qs2.docs[0];
            }

            if (!snap || !snap.exists()) {
                _state = { userType: 'AGENTE', clienteAsignado: null, unidadesAsignadas: [] };
                this.state = _state;
                return _state;
            }

            data = snap.data()!;
            const tipo: UserType = (data.TIPOACCESO || data.tipo || 'AGENTE').toUpperCase() as UserType;

            _state = {
                userType: tipo,
                clienteAsignado: data.CLIENTE || null,
                unidadesAsignadas: data.UNIDADES || (data.UNIDAD ? [data.UNIDAD] : []),
                macrozona: data.Macrozona || data.MACROZONA,
                zona: data.Zona || data.ZONA,
            };
            this.state = _state;
            return _state;
        } catch (error) {
            console.error('Error fetching access control:', error);
            _state = { userType: 'AGENTE', clienteAsignado: null, unidadesAsignadas: [] };
            this.state = _state;
            return _state;
        }
    },

    isAdmin(): boolean { return _state?.userType === 'ADMIN'; },
    isSupervisor(): boolean { return _state?.userType === 'SUPERVISOR'; },
    isAgente(): boolean { return _state?.userType === 'AGENTE'; },
    isCliente(): boolean { return _state?.userType === 'CLIENTE'; },

    canManageUsers(): boolean { return this.isAdmin(); },
    canEditData(): boolean { return this.isAdmin() || this.isSupervisor(); },

    getClienteFilter(): string | null {
        return _state?.userType === 'CLIENTE' ? _state.clienteAsignado : null;
    },

    getUnidadesAsignadas(): string[] {
        return _state?.unidadesAsignadas || [];
    },

    // Filter a Firestore query with client restrictions
    applyClienteFilter(queryRef: any): any {
        const cliente = this.getClienteFilter();
        if (!cliente) return queryRef;
        return query(queryRef, where('cliente', '==', cliente));
    },

    // For sidebar: which nav items to show
    canView(view: string): boolean {
        if (this.isAdmin()) return true;
        const restricted = ['view-usuarios', 'view-tipo-incidencias', 'view-crear-qr', 'view-crear-rondas'];
        if (this.isSupervisor()) return !['view-usuarios'].includes(view);
        if (this.isCliente()) return !restricted.includes(view);
        return false;
    }
};
