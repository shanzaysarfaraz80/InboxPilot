from backend.supabase_client import get_all_tickets
try:
    print(get_all_tickets())
    print("Success")
except Exception as e:
    print(f"Error: {e}")
