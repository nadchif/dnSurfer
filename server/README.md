# dnSurfer Server

## Requirements

- [Node.js 20+](https://nodejs.org/en/download)
- [Redis](https://redis.io/)

## Running locally

1. Ensure you are in the `server` folder after cloning the repository.

```bash
cd server
```

2. Ensure redis is running on the same machine. 
Easiest (cleanest) way could be using docker:
```
docker run --rm --name temp-redis -d -p 6379:6379 redis:8.2-alpine
```
 
3. Install npm dependencies

```bash
npm install
```

4. Start development server
```bash
npm run dev
```


## Testing via terminal

```bash
# Query https://news.ycombinator.com/ page 0
dig @127.0.0.1 -p 53 +short aHR0cHM6Ly9uZXdzLnljb21iaW5hdG9yLmNvbS8=.0.dns.me TXT
```

## Deploying to EC2

1. [Launch](https://us-east-1.console.aws.amazon.com/ec2/home?region=us-east-1#LaunchInstances:) a new Ubuntu instance. 
2. Configure Security Group to allow DNS traffic
   - **Inbound Rules**: Add rule for UDP port 53 from source 0.0.0.0/0 (or your specific IP ranges)
   - **Outbound Rules**: Ensure UDP port 53 is allowed to 0.0.0.0/0 (usually allowed by default)
3. Connect to your instance via SSH. [See Guide](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/connect-linux-inst-ssh.html) 
4. Install redis. [See Guide](https://redis.io/docs/latest/operate/oss_and_stack/install/archive/install-redis/install-redis-on-linux/#install-on-ubuntudebian)
5. Install nvm and node LTS. [See Guide](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-up-node-on-ec2-instance.html).
6. Install pm2
   ```bash
   npm install -g pm2
   ```
7. Clone repository
   ```bash
   git clone https://github.com/nadchif/dnSurfer.git
   ```
8. Navigate to the server directory and install dependencies
   ```bash
   cd dnSurfer/server
   npm install
   ```
9. Start the server using pm2 with environment variables
   ```bash
   # Start with port 8053
    PORT=8053 pm2 start src/server.js --name "dnSurfer-server"
   ```
10. Set up port forwarding from DNS port 53 to 8053
   ```bash
   # Forward incoming UDP port 53 to 8053
   sudo iptables -t nat -A PREROUTING -p udp --dport 53 -j REDIRECT --to-port 8053
   
   # Forward incoming TCP port 53 to 8053 (if you handle TCP DNS too)
   sudo iptables -t nat -A PREROUTING -p tcp --dport 53 -j REDIRECT --to-port 8053
   ```

11. Make iptables rules persistent across reboots
    ```bash
    sudo apt-get install iptables-persistent
    sudo netfilter-persistent save
    ```

12. Set up PM2 to start on system boot (daemon mode)
    ```bash
    # Generate startup script
    pm2 startup
    
    # Save current pm2 processes
    pm2 save
    ```
    **Note**: Follow the instructions provided by `pm2 startup` command - it will give you a command to run with sudo that sets up the auto-start.

13. Verify the server is running
    ```bash
    pm2 status
    pm2 logs dnSurfer-server
    ```
14. Note the **Public DNS** of your EC2, it looks something like `ec2-12-123-123-12.compute-1.amazonaws.com`
    
15. Check if its working by running the following in your terminal:
    ```bash
    dig @<PUBLIC_DNS_FROM_ABOVE> -p 53 +short aHR0cHM6Ly9uZXdzLnljb21iaW5hdG9yLmNvbS8=.0.dns.me TXT
    ```
    
    replace `<PUBLIC_DNS_FROM_ABOVE>` with the Public DNS you got in step 14

