/*
 * Endereço do banco de dados (Supabase) e a chave pública dele.
 *
 * A chave "anon" é feita para ir dentro de programas e pode ficar no
 * código: sozinha ela não enxerga nada, porque o banco só libera os dados
 * para quem entrou com um usuário cadastrado na tabela "usuarios".
 *
 * NUNCA coloque aqui a chave "service_role": ela dá acesso total ao banco
 * e iria junto no instalador, que é público.
 */

module.exports = {
  SUPABASE_URL:
    process.env.SUPABASE_URL || 'http://supabasekong-hn5ch7w6ui68m52ag5d8re4h.2.24.115.118.sslip.io',
  SUPABASE_ANON_KEY:
    process.env.SUPABASE_ANON_KEY ||
    'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc5MTIzOTU4MCwiZXhwIjo0OTQ2OTEzMTgwLCJyb2xlIjoiYW5vbiJ9.Bj7fXKM3Xl1GrONauk50xYdbOK9UlS5iWceb4j_yX4Y'
};
