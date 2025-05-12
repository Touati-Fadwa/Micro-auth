pipeline {
  agent any

  environment {
    IMAGE_NAME = "touatifadwa/bibliotheque-microauth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        dir('microservice-auth') {
          sh 'npm ci'
        }
      }
    }

    stage('Build') {
      steps {
        dir('microservice-auth') {
          sh 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        dir('microservice-auth') {
          sh 'npm test -- --coverage'
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f ./Dockerfile ."
        }
      }
    }

    stage('Docker Login & Push') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'docker-hub-credentials',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh '''
            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin $REGISTRY
            docker push ${IMAGE_NAME}:${IMAGE_TAG}
          '''
        }
      }
    }

    stage('Create Kubernetes Secrets') {
      steps {
        script {
          withCredentials([
            string(credentialsId: 'JWT_SECRET_CREDENTIALS', variable: 'JWT_SECRET'),
            usernamePassword(
              credentialsId: 'DB_CREDENTIALS',
              usernameVariable: 'DB_USER',
              passwordVariable: 'DB_PASSWORD'
            )
          ]) {
            sh '''
              sed -i "s/{{JWT_SECRET}}/${JWT_SECRET}/g" k8s/secrets.yaml
              sed -i "s/{{DB_USER}}/${DB_USER}/g" k8s/secrets.yaml
              sed -i "s/{{DB_PASSWORD}}/${DB_PASSWORD}/g" k8s/secrets.yaml
              kubectl apply -f k8s/secrets.yaml
            '''
          }
        }
      }
    }

    stage('Configure K3s Access') {
      steps {
        script {
          withCredentials([string(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_CONTENT')]) {
            sh '''
              # Création du fichier kubeconfig
              mkdir -p ~/.kube
              cat <<EOF > ~/.kube/config
              ${KUBECONFIG_CONTENT}
              EOF
              chmod 600 ~/.kube/config

              # Vérification
              kubectl config view --minify
              kubectl cluster-info
              
              # Création du namespace si inexistant
              kubectl get namespace ${KUBE_NAMESPACE} || kubectl create namespace ${KUBE_NAMESPACE}
            '''
          }
        }
      }
    }

    stage('Deploy to K3s') {
      steps {
        script {
          withCredentials([string(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_CONTENT')]) {
            sh '''
              # Régénération du kubeconfig
              mkdir -p ~/.kube
              cat <<EOF > ~/.kube/config
              ${KUBECONFIG_CONTENT}
              EOF
              chmod 600 ~/.kube/config

              # Déploiement
              kubectl config set-context --current --namespace=${KUBE_NAMESPACE}
              kubectl apply -f k8s/bibliotheque-auth-deployment.yaml
              kubectl apply -f k8s/bibliotheque-auth-service.yaml
            '''
          }
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        script {
          withCredentials([string(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_CONTENT')]) {
            sh '''
              # Régénération du kubeconfig
              mkdir -p ~/.kube
              cat <<EOF > ~/.kube/config
              ${KUBECONFIG_CONTENT}
              EOF
              chmod 600 ~/.kube/config

              # Vérification
              kubectl wait --for=condition=available \
                --timeout=300s \
                deployment/bibliotheque-auth \
                -n ${KUBE_NAMESPACE}

              echo "=== Deployment Status ==="
              kubectl get deploy -n ${KUBE_NAMESPACE}
              
              echo "=== Service Details ==="
              kubectl get svc -n ${KUBE_NAMESPACE}
              
              echo "=== Pods Status ==="
              kubectl get pods -n ${KUBE_NAMESPACE}
              
              # Génération URL
              echo "Application accessible via:"
              NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
              NODE_PORT=$(kubectl get svc bibliotheque-auth-service -n ${KUBE_NAMESPACE} -o jsonpath='{.spec.ports[0].nodePort}')
              echo "http://${NODE_IP}:${NODE_PORT}"
            '''
          }
        }
      }
    }
  }

  post {
    failure {
      script {
        echo "Pipeline failed! Attempting rollback..."
        withCredentials([string(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_CONTENT')]) {
          sh '''
            # Régénération du kubeconfig
            mkdir -p ~/.kube
            cat <<EOF > ~/.kube/config
            ${KUBECONFIG_CONTENT}
            EOF
            chmod 600 ~/.kube/config

            echo "!!! Rollback initiated !!!"
            kubectl rollout undo deployment/bibliotheque-auth -n ${KUBE_NAMESPACE}
            kubectl rollout status deployment/bibliotheque-auth -n ${KUBE_NAMESPACE}
          '''
        }
      }
    }
    always {
      sh 'docker logout ${REGISTRY} || true'
      sh 'rm -f ~/.kube/config || true'
      echo "Pipeline execution completed"
    }
  }
}