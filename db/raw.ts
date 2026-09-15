import mysql, {type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader} from 'mysql2/promise';
let pool: Pool | undefined;
function connectionPool() {
 if(!pool) {
  const url=process.env.DATABASE_URL;
  if(!url) throw new Error('DATABASE_URL is required');
  pool=mysql.createPool({uri:url,connectionLimit:5,waitForConnections:true,queueLimit:100,decimalNumbers:true,multipleStatements:false});
 }
 return pool;
}
class Statement {
 constructor(readonly sql:string,readonly values:(string|number|boolean|null)[]=[]){ }
 bind(...values:(string|number|boolean|null)[]) {return new Statement(this.sql,values);}
 async first<T=Record<string,unknown>>():Promise<T|null> {const {results}=await this.all<T>();return results[0]??null;}
 async all<T=Record<string,unknown>>() {const [rows]=await connectionPool().execute<RowDataPacket[]>(this.sql,this.values);return {results:rows as T[]};}
 async execute(connection:Pool|PoolConnection) {const [result]=await connection.execute<ResultSetHeader>(this.sql,this.values);return {meta:{changes:result.affectedRows}};}
 async run() {return this.execute(connectionPool());}
}
const database={
 prepare(sql:string){return new Statement(sql);},
 async batch(statements:Statement[]){
  const connection=await connectionPool().getConnection();
  try {await connection.beginTransaction();const results=[];for(const statement of statements)results.push(await statement.execute(connection));await connection.commit();return results;}
  catch(error){await connection.rollback();throw error;}
  finally{connection.release();}
 }
};
export type BenchmarkDatabase=typeof database;
export function rawDb(){return database;}
