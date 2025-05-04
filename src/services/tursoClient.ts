// src/services/tursoClient.ts
type QueryResult = {
    columns: string[];
    rows: any[];
  };

  type QueryParam = {
    value: any;
    type?: 'text' | 'integer' | 'float' | 'boolean';
  };
  
  export class TursoClient {
    private dbUrl: string;
    private authToken: string;
  
    constructor() {
      this.dbUrl = process.env.NEXT_PUBLIC_URL_FOUR!;
      this.authToken = process.env.NEXT_PUBLIC_TOKEN_FOUR!;
  
      if (!this.dbUrl || !this.authToken) {
        throw new Error('Turso database configuration missing');
      }
  
      if (!this.dbUrl.startsWith('https://')) {
        throw new Error('Invalid URL format. URL must start with https://');
      }
    }
  
    async executeQuery(query: string, params: (QueryParam | any)[] = []): Promise<QueryResult> {
      try {
        console.log('TursoClient executing query:', query);
        console.log('with params:', params);
        
        // Simple direct query without parameter formatting
        const response = await fetch(`${this.dbUrl}/v2/pipeline`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                type: "execute",
                stmt: {
                  sql: query
                }
              },
              { type: "close" }
            ]
          }),
        });
  
        if (!response.ok) {
          console.error('Turso API error:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('Error details:', errorText);
          throw new Error(`Database error: ${response.statusText}`);
        }
  
        const result = await response.json();
        console.log('Raw Turso response:', JSON.stringify(result, null, 2));
        
        const queryResult = result?.results?.[0]?.response?.result;
        if (!queryResult) {
          return { columns: [], rows: [] };
        }
  
        // Extract column names from cols array
        const columns = queryResult.cols.map((col: any) => col.name);
        
        const transformedRows = queryResult.rows.map((row: any[]) => {
          if (!Array.isArray(row)) return {};
          
          const obj: any = {};
          columns.forEach((column: string, index: number) => {
            obj[column] = row[index]?.value;
          });
          return obj;
        });
  
        return {
          columns,
          rows: transformedRows
        };
      } catch (error) {
        console.error('Query execution error:', error);
        throw error;
      }
    }
  }