export interface MessagesState {
  loading: boolean;
  error: string | null;
}

export const initialState: MessagesState = {
  loading: false,
  error: null,
};
